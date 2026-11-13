"""Vendored updates copy managed files and preserve retired files; synthetic only."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import sync_core as S

class SyncCore(unittest.TestCase):
    def test_update_preserves_retired_and_refuses_dirty_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);core=root/'core';core.mkdir();lock=root/'core.lock'
            (core/'kept.txt').write_text('old\n');(core/'retired.txt').write_text('preserve\n')
            lock.write_text(json.dumps({'files':{n:S.digest(core/n) for n in ('kept.txt','retired.txt')}}))
            data=io.BytesIO()
            with tarfile.open(fileobj=data,mode='w') as archive:
                for name,value in [('kept.txt',b'new\n'),('added.txt',b'added\n')]:
                    info=tarfile.TarInfo(name);info.size=len(value);archive.addfile(info,io.BytesIO(value))
            def git(args,**kwargs):return SimpleNamespace(stdout=data.getvalue() if 'archive' in args else b'123456789abcdef\n')
            with patch.multiple(S,ROOT=root,CORE=core,LOCK=lock),patch.object(S.subprocess,'run',side_effect=git):
                self.assertEqual(S.main(['--from',str(root),'--tag','test']),0)
                self.assertEqual((core/'kept.txt').read_text(),'new\n')
                self.assertEqual((root/'_attic/core-sync/123456789abc/retired.txt').read_text(),'preserve\n')
                self.assertFalse((core/'retired.txt').exists());self.assertEqual(S.local_edits(),[])
                (core/'kept.txt').write_text('local changes\n')
                self.assertEqual(S.main(['--from',str(root),'--tag','test']),2)
                self.assertEqual((core/'kept.txt').read_text(),'local changes\n')

if __name__=='__main__':unittest.main()
