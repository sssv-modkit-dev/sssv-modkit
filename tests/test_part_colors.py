"""Per-part overrides coexist with animal-wide recolour through protected words."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from test_builder import B, fake_rom, table, DL

class PartColors(unittest.TestCase):
    def config(self):
        return {'animal':'bear','recolor':{'B03F00FF':'00FF00'},
                'skip_recolor_words':[DL+4],
                'words':[{'word_rom':DL+4,'expect':'B03F00FF','new':'FF00FFFF'}]}

    def test_local_override_and_global_recolour_are_both_applied(self):
        plan=B.plan_edits(table(),bytes(fake_rom()),[('test',self.config())],log=lambda s:None)
        edited,_=B.apply_plan(bytes(fake_rom()),plan,log=lambda s:None)
        self.assertEqual(edited[DL+4:DL+8].hex(),'ff00ffff')
        self.assertEqual(edited[DL+12:DL+16].hex(),'00ff00ff')

    def test_existing_skip_still_excludes_all_edits(self):
        cfg=self.config();cfg['skip_words']=[DL+4]
        plan=B.plan_edits(table(),bytes(fake_rom()),[('test',cfg)],log=lambda s:None)
        self.assertNotIn(DL+4,plan['words'])

    def test_local_override_keeps_expected_word_and_ownership_checks(self):
        cfg=self.config();cfg['words'][0]['expect']='FFFFFFFF'
        with self.assertRaisesRegex(SystemExit,'expected'):
            B.plan_edits(table(),bytes(fake_rom()),[('test',cfg)],log=lambda s:None)
        cfg=self.config();cfg['words'][0]['word_rom']=0x888
        with self.assertRaisesRegex(SystemExit,'not a colour word'):
            B.plan_edits(table(),bytes(fake_rom()),[('test',cfg)],log=lambda s:None)

if __name__=='__main__':unittest.main()
