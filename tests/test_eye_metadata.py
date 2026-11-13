"""Synthetic MIPS eye-material recovery, no game input required."""
import struct
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import animal_rom as A

class EyeMetadata(unittest.TestCase):
    def test_immediate_draw_uses_verified_loader(self):
        words=[0x3C040100,0x24840CC0,0x3C050100,0x24A50620,
               0x3C080400,0x25080080,0xAFA80024,A.EYE_TEXTURE_JAL,0,
               A.PART_DRAW_JAL,0]
        class Code(A.Code):
            def _func_starts(self): return [0]
        code=Code(struct.pack('>'+str(len(words))+'I',*words))
        result=A.eye_textures(code,0,len(words)*4)
        self.assertEqual(result[0x04000080]['image'],A.SEG1_BASE+0x620)
        self.assertEqual(result[0x04000080]['palette'],A.SEG1_BASE+0xCC0)
        words[8]=0x0C000123
        self.assertEqual(A.eye_textures(Code(struct.pack('>'+str(len(words))+'I',*words)),0,len(words)*4),{})

if __name__=='__main__': unittest.main()
