// sssv-modkit offline launcher.
//
// Serves the public site (app/ next to this program) on 127.0.0.1 only, opens it
// in the default browser, and adds a small local API so pages can read a ROM from
// rom/, save builds to out/, and open them with the user's own programs.
// It writes nothing outside its own folder and never scans the disk.
package main

import (
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

//go:embed bridge.js bridge.css
var bridgeFS embed.FS

const (
	cookieName  = "sssv_bundle"
	maxSave     = 256 << 20 // largest file the page may save to out/
	bridgeTag   = `<script src="/bundle/bridge.js" defer></script><link rel="stylesheet" href="/bundle/bridge.css">`
	settingsDoc = `{
  "_help": "Optional. Leave emulator empty to use the program your system opens .z64 files with. Otherwise list the program and its arguments; {rom} becomes the ROM path. Example: [\"C:/RetroArch/retroarch.exe\", \"-L\", \"cores/mupen64plus_next_libretro.dll\", \"{rom}\"]",
  "emulator": []
}
`
)

var (
	romExt   = map[string]bool{".z64": true, ".v64": true, ".n64": true}
	safeName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,120}$`)
)

type server struct {
	root, appDir, romDir, outDir string
	token, host                  string
}

type settings struct {
	Emulator []string `json:"emulator"`
}

func main() {
	noBrowser := flag.Bool("no-browser", false, "print the URL instead of opening the browser")
	port := flag.Int("port", 0, "port on 127.0.0.1 (0 = pick a free one)")
	flag.Parse()

	exe, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	root := filepath.Dir(exe)
	if fi, err := os.Stat(filepath.Join(root, "app", "index.html")); err != nil || fi.IsDir() {
		// `go run` puts the binary in a temp dir: fall back to the working directory.
		if wd, _ := os.Getwd(); wd != "" {
			root = wd
		}
	}
	s := &server{root: root, appDir: filepath.Join(root, "app"), romDir: filepath.Join(root, "rom"), outDir: filepath.Join(root, "out")}
	if _, err := os.Stat(filepath.Join(s.appDir, "index.html")); err != nil {
		fatal("app/index.html not found next to this program. Unzip the whole bundle and run it from its folder.")
	}
	for _, d := range []string{s.romDir, s.outDir} {
		_ = os.MkdirAll(d, 0o755)
	}
	if _, err := os.Stat(filepath.Join(root, "settings.json")); errors.Is(err, os.ErrNotExist) {
		_ = os.WriteFile(filepath.Join(root, "settings.json"), []byte(settingsDoc), 0o644)
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		fatal("could not open a local port: " + err.Error())
	}
	s.host = ln.Addr().String()
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		log.Fatal(err)
	}
	s.token = hex.EncodeToString(b)

	url := "http://" + s.host + "/bundle/start?t=" + s.token
	fmt.Println("sssv-modkit is running at http://" + s.host + "/")
	fmt.Println("Folder:", root)
	fmt.Println("Keep this window open while you use it. Close it (or press Ctrl+C) to stop.")
	if *noBrowser {
		fmt.Println("Open this link to start:", url)
	} else if err := openDefault(url); err != nil {
		fmt.Println("Could not open your browser. Open this link yourself:", url)
	}
	srv := &http.Server{Handler: s, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.Serve(ln))
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, "sssv-modkit:", msg)
	if os.Getenv("SSSV_NO_PAUSE") == "" {
		fmt.Fprintln(os.Stderr, "Press Enter to close.")
		_, _ = fmt.Scanln()
	}
	os.Exit(1)
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// DNS-rebinding guard: only answer requests addressed to our own host:port.
	if r.Host != s.host {
		http.Error(w, "wrong host", http.StatusMisdirectedRequest)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	switch {
	case r.URL.Path == "/bundle/start":
		s.start(w, r)
	case r.URL.Path == "/bundle/bridge.js" || r.URL.Path == "/bundle/bridge.css":
		data, _ := bridgeFS.ReadFile(strings.TrimPrefix(r.URL.Path, "/bundle/"))
		if strings.HasSuffix(r.URL.Path, ".js") {
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		} else {
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		}
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(data)
	case strings.HasPrefix(r.URL.Path, "/bundle/api/"):
		if !s.authorized(r) {
			http.Error(w, "not authorized; restart the launcher", http.StatusForbidden)
			return
		}
		s.api(w, r)
	default:
		if !s.hasCookie(r) {
			http.Error(w, "Open the link the launcher printed (or restart it).", http.StatusForbidden)
			return
		}
		s.static(w, r)
	}
}

func (s *server) start(w http.ResponseWriter, r *http.Request) {
	if subtle.ConstantTimeCompare([]byte(r.URL.Query().Get("t")), []byte(s.token)) != 1 {
		http.Error(w, "stale link; use the one the launcher printed", http.StatusForbidden)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: s.token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (s *server) hasCookie(r *http.Request) bool {
	c, err := r.Cookie(cookieName)
	return err == nil && subtle.ConstantTimeCompare([]byte(c.Value), []byte(s.token)) == 1
}

func (s *server) authorized(r *http.Request) bool {
	if !s.hasCookie(r) {
		return false
	}
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" {
		return false
	}
	if o := r.Header.Get("Origin"); o != "" && o != "http://"+s.host {
		return false
	}
	// A custom header forces a CORS preflight for any cross-origin caller, which we never approve.
	return r.Method == http.MethodGet || r.Header.Get("X-SSSV-Bundle") == "1"
}

func (s *server) static(w http.ResponseWriter, r *http.Request) {
	rel := filepath.FromSlash(strings.TrimPrefix(filepath.ToSlash(filepath.Clean("/"+r.URL.Path)), "/"))
	p := filepath.Join(s.appDir, rel)
	if fi, err := os.Stat(p); err == nil && fi.IsDir() {
		p = filepath.Join(p, "index.html")
	}
	if strings.EqualFold(filepath.Ext(p), ".html") {
		data, err := os.ReadFile(p)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		html := injectBridge(string(data))
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = io.WriteString(w, html)
		return
	}
	http.ServeFile(w, r, p)
}

var cspMeta = regexp.MustCompile(`(?i)(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")`)

// injectBridge adds the bundle panel to pages whose policy allows same-origin scripts
// (redirect stubs with hash-only scripts are left alone). Pages without connect-src
// get connect-src 'self' so the panel can reach this launcher; nothing else is relaxed.
func injectBridge(html string) string {
	m := cspMeta.FindStringSubmatchIndex(html)
	if m != nil {
		csp := html[m[4]:m[5]]
		if !regexp.MustCompile(`script-src[^;]*'self'`).MatchString(csp) {
			return html
		}
		if !strings.Contains(csp, "connect-src") {
			html = html[:m[5]] + "; connect-src 'self'" + html[m[5]:]
		}
	}
	if i := strings.Index(strings.ToLower(html), "</head>"); i >= 0 {
		html = html[:i] + bridgeTag + html[i:]
	}
	return html
}

type fileInfo struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

func listDir(dir string, filter func(string) bool) []fileInfo {
	entries, _ := os.ReadDir(dir)
	out := []fileInfo{}
	for _, e := range entries {
		if e.IsDir() || !filter(e.Name()) {
			continue
		}
		if fi, err := e.Info(); err == nil {
			out = append(out, fileInfo{e.Name(), fi.Size()})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func isROM(name string) bool { return romExt[strings.ToLower(filepath.Ext(name))] }

func (s *server) loadSettings() settings {
	var st settings
	if data, err := os.ReadFile(filepath.Join(s.root, "settings.json")); err == nil {
		_ = json.Unmarshal(data, &st)
	}
	return st
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

// named returns a file directly inside dir, refusing anything that is not a plain listed name.
func named(dir, name string) (string, bool) {
	if !safeName.MatchString(name) || name != filepath.Base(name) {
		return "", false
	}
	p := filepath.Join(dir, name)
	fi, err := os.Stat(p)
	return p, err == nil && !fi.IsDir()
}

func (s *server) api(w http.ResponseWriter, r *http.Request) {
	switch strings.TrimPrefix(r.URL.Path, "/bundle/api/") {
	case "status":
		writeJSON(w, map[string]any{
			"roms":     listDir(s.romDir, isROM),
			"out":      listDir(s.outDir, func(string) bool { return true }),
			"emulator": len(s.loadSettings().Emulator) > 0,
			"command":  s.loadSettings().Emulator,
			"folder":   s.root,
		})
	case "settings":
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		var req struct{ Program, Args string }
		if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		cmd, err := emulatorCommand(req.Program, req.Args)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		data, _ := json.MarshalIndent(map[string]any{"_help": "Set from the Bundle panel. {rom} becomes the ROM path. Empty = use your system's program for .z64 files.", "emulator": cmd}, "", "  ")
		if err := os.WriteFile(filepath.Join(s.root, "settings.json"), append(data, '\n'), 0o644); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"command": cmd})
	case "rom":
		name := r.URL.Query().Get("name")
		p, ok := named(s.romDir, name)
		if !ok || !isROM(name) {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, p)
	case "save":
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		name := filepath.Base(r.URL.Query().Get("name"))
		if !safeName.MatchString(name) {
			http.Error(w, "bad file name", http.StatusBadRequest)
			return
		}
		p := uniquePath(s.outDir, name)
		f, err := os.OpenFile(p, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		n, err := io.Copy(f, http.MaxBytesReader(w, r.Body, maxSave))
		f.Close()
		if err != nil {
			os.Remove(p)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"name": filepath.Base(p), "size": n})
	case "open":
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}
		var req struct{ Name, How string }
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		p, ok := named(s.outDir, req.Name)
		if !ok {
			http.NotFound(w, r)
			return
		}
		var err error
		switch req.How {
		case "default":
			err = openDefault(p)
		case "folder":
			err = revealInFolder(p)
		case "emulator":
			err = s.openEmulator(p)
		default:
			err = errors.New("unknown action")
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	default:
		http.NotFound(w, r)
	}
}

func uniquePath(dir, name string) string {
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	p := filepath.Join(dir, name)
	for i := 2; ; i++ {
		if _, err := os.Stat(p); errors.Is(err, os.ErrNotExist) {
			return p
		}
		p = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", stem, i, ext))
	}
}

// emulatorCommand turns the panel's program path and optional arguments into an argv list.
// An empty program clears the setting. Arguments split on spaces; "quoted parts" stay together.
func emulatorCommand(program, args string) ([]string, error) {
	program = strings.Trim(strings.TrimSpace(program), `"'`)
	if program == "" {
		return []string{}, nil
	}
	fi, err := os.Stat(program)
	if err != nil {
		return nil, fmt.Errorf("can't find %s", program)
	}
	if fi.IsDir() && !(runtime.GOOS == "darwin" && strings.HasSuffix(strings.ToLower(program), ".app")) {
		return nil, errors.New("that is a folder; choose the emulator program itself")
	}
	cmd := []string{program}
	for _, m := range regexp.MustCompile(`"[^"]*"|\S+`).FindAllString(args, -1) {
		cmd = append(cmd, strings.Trim(m, `"`))
	}
	return cmd, nil
}

// openEmulator runs the program from settings.json directly (no shell), with {rom} replaced.
func (s *server) openEmulator(rom string) error {
	cmd := s.loadSettings().Emulator
	if len(cmd) == 0 {
		return errors.New("no emulator set yet: add it under Your emulator in the panel")
	}
	if runtime.GOOS == "darwin" && strings.HasSuffix(strings.ToLower(cmd[0]), ".app") {
		// macOS app bundles: let the system start the app with the ROM.
		cmd = append([]string{"/usr/bin/open", "-a", cmd[0], "{rom}", "--args"}, cmd[1:]...)
	}
	args := make([]string, 0, len(cmd))
	hasROM := false
	for _, a := range cmd[1:] {
		if strings.Contains(a, "{rom}") {
			hasROM = true
		}
		args = append(args, strings.ReplaceAll(a, "{rom}", rom))
	}
	if !hasROM {
		args = append(args, rom)
	}
	c := exec.Command(cmd[0], args...)
	c.Dir = filepath.Dir(cmd[0])
	if c.Dir == "." {
		c.Dir = s.root
	}
	if err := c.Start(); err != nil {
		return fmt.Errorf("could not start %s: %w", filepath.Base(cmd[0]), err)
	}
	go c.Wait()
	return nil
}
