//go:build !windows

package main

import (
	"os/exec"
	"path/filepath"
	"runtime"
)

func start(name string, args ...string) error {
	c := exec.Command(name, args...)
	if err := c.Start(); err != nil {
		return err
	}
	go c.Wait()
	return nil
}

// openDefault opens target with the program the desktop has registered for it.
func openDefault(target string) error {
	if runtime.GOOS == "darwin" {
		return start("open", target)
	}
	return start("xdg-open", target)
}

func startProgram(program string, args []string, dir string) error {
	c := exec.Command(program, args...)
	c.Dir = dir
	if err := c.Start(); err != nil {
		return err
	}
	go c.Wait()
	return nil
}

func revealInFolder(path string) error {
	if runtime.GOOS == "darwin" {
		return start("open", "-R", path)
	}
	return start("xdg-open", filepath.Dir(path))
}
