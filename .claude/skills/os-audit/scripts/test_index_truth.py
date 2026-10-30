import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('os_audit.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

class MemoryReachabilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.claude=Path(self.tmp.name);self.memory=self.claude/'memory';self.memory.mkdir()
        for name in ['MEMORY.md','MEMORY-user.md','MEMORY-indice.md']:
            self.write(name,'')
    def write(self,name,text):
        p=self.memory/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
    def check(self):
        with patch.object(audit,'CLAUDE',self.claude):return audit.check_index_truth()
    def test_user_index_and_reachable_cycle_are_not_orphans(self):
        self.write('MEMORY-user.md','`user/person.md`')
        self.write('user/person.md','`reference/rules.md`')
        self.write('reference/rules.md','`user/person.md`')
        self.assertEqual(self.check()['estado'],audit.VERDE)
    def test_unreachable_cycle_remains_orphaned(self):
        self.write('project/a.md','`project/b.md`');self.write('project/b.md','`project/a.md`')
        self.assertEqual(self.check()['datos']['huerfanos'],['project/a.md','project/b.md'])
    def test_broken_nested_link_is_red(self):
        self.write('MEMORY.md','`reference/rules.md`');self.write('reference/rules.md','`feedback/missing.md`')
        self.assertEqual(self.check()['estado'],audit.ROJO)
    def test_relative_markdown_and_same_folder_links_are_reachable(self):
        self.write('MEMORY.md','`project/start.md`')
        self.write('project/start.md','[source](../reference/provenance.md) · `next.md`')
        self.write('project/next.md','');self.write('reference/provenance.md','')
        self.assertEqual(self.check()['estado'],audit.VERDE)
    def test_glob_resolves_real_references(self):
        self.write('MEMORY.md','`feedback/security-*.md`')
        self.write('feedback/security-one.md','')
        self.assertEqual(self.check()['estado'],audit.VERDE)
    def test_unmatched_pattern_is_visible_as_ambiguous(self):
        self.write('MEMORY.md','`user/realidad-1..4-*.md`')
        self.assertEqual(self.check()['estado'],audit.AMBAR)
    def test_missing_user_index_is_not_silent(self):
        (self.memory/'MEMORY-user.md').unlink()
        self.assertEqual(self.check()['estado'],audit.ROJO)

class UserSkillTests(unittest.TestCase):
    def test_provider_aliases_share_one_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);canonical=home/'.claude/skills/demo';canonical.mkdir(parents=True)
            (canonical/'SKILL.md').write_text('demo')
            provider=home/'.agents/skills';provider.mkdir(parents=True)
            (provider/'demo').symlink_to(canonical)
            self.assertEqual(audit.user_skill_duplicates(home),[])
    def test_reinstall_creating_identical_copy_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp)
            for provider in ['.claude','.agents']:
                folder=home/provider/'skills/demo';folder.mkdir(parents=True)
                (folder/'SKILL.md').write_text('same')
            self.assertEqual(len(audit.user_skill_duplicates(home)),1)

if __name__=='__main__':unittest.main()
