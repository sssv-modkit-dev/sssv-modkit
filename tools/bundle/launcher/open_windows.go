//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var shellExecute = syscall.NewLazyDLL("shell32.dll").NewProc("ShellExecuteW")

// openDefault asks Windows to open target with its registered program (no shell parsing).
func openDefault(target string) error {
	verb, _ := syscall.UTF16PtrFromString("open")
	file, err := syscall.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	r, _, _ := shellExecute.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(file)), 0, 0, 1)
	if r <= 32 {
		if r == 31 { // SE_ERR_NOASSOC
			return fmt.Errorf("no program is set to open this file type; choose one in Windows (Open with) or set an emulator in settings.json")
		}
		return fmt.Errorf("Windows could not open the file (code %d)", r)
	}
	return nil
}

// startProgram launches an emulator the way Explorer would (ShellExecuteW), not as a child
// of this console: Project64 showed a black screen at 0 FPS when started via CreateProcess.
func startProgram(program string, args []string, dir string) error {
	quoted := make([]string, len(args))
	for i, a := range args {
		quoted[i] = syscall.EscapeArg(a)
	}
	verb, _ := syscall.UTF16PtrFromString("open")
	file, err := syscall.UTF16PtrFromString(program)
	if err != nil {
		return err
	}
	params, _ := syscall.UTF16PtrFromString(strings.Join(quoted, " "))
	wd, _ := syscall.UTF16PtrFromString(dir)
	r, _, _ := shellExecute.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(file)), uintptr(unsafe.Pointer(params)), uintptr(unsafe.Pointer(wd)), 1)
	if r <= 32 {
		return fmt.Errorf("could not start %s (code %d)", filepath.Base(program), r)
	}
	return nil
}

func revealInFolder(path string) error {
	// explorer.exe returns exit code 1 even on success, so ignore Wait's result.
	c := exec.Command("explorer.exe", "/select,"+path)
	if err := c.Start(); err != nil {
		return err
	}
	go c.Wait()
	return nil
}
