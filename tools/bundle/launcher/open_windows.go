//go:build windows

package main

import (
	"fmt"
	"os/exec"
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

func revealInFolder(path string) error {
	// explorer.exe returns exit code 1 even on success, so ignore Wait's result.
	c := exec.Command("explorer.exe", "/select,"+path)
	if err := c.Start(); err != nil {
		return err
	}
	go c.Wait()
	return nil
}
