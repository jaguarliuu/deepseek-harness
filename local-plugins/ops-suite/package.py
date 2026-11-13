"""Build a self-contained runtime dependency archive from current built artifacts."""
import json
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent
OUTPUT = ROOT / 'output/ops-suite'


def resolve_package(origin, name):
    """Resolve a physical Node package without retaining pnpm symlinks."""
    for parent in [origin, *origin.parents]:
        candidate = parent / 'node_modules' / name
        if (candidate / 'package.json').is_file():
            return candidate.resolve()
    raise RuntimeError(f'Missing build dependency {name} from {origin}')


def build():
    """Pack runtime artifacts and licenses; leave Host peers to the application."""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='ops-suite-') as temporary:
        work = Path(temporary)
        stage = work / 'ops-suite'
        stage.mkdir()
        for filename in ['package.json', 'index.js', 'cordis.patch.yml', 'README.md', 'README.zh.md']:
            shutil.copy2(SOURCE / filename, stage / filename)
        visited = {}

        def collect(origin):
            meta = json.loads((origin / 'package.json').read_text())
            name = meta['name']
            if name in visited:
                if visited[name] != meta['version']:
                    raise RuntimeError(f'Conflicting runtime versions for {name}')
                return
            visited[name] = meta['version']
            target = stage / 'node_modules' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if origin.is_relative_to(ROOT / 'packages') or origin.is_relative_to(ROOT / 'vendor'):
                packdir = work / 'packed' / name.replace('/', '-')
                packdir.mkdir(parents=True)
                subprocess.run(['pnpm', 'pack', '--pack-destination', str(packdir)], cwd=origin, check=True, stdout=subprocess.DEVNULL)
                with tarfile.open(next(packdir.glob('*.tgz'))) as archive:
                    for item in archive.getmembers():
                        if not item.isfile():
                            continue
                        relative = Path(item.name).relative_to('package')
                        if '..' in relative.parts:
                            raise RuntimeError('Unexpected archive path')
                        destination = target / relative
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        destination.write_bytes(archive.extractfile(item).read())
            else:
                shutil.copytree(origin, target, ignore=shutil.ignore_patterns('node_modules', '.git', '*.node'))
            for dependency in meta.get('dependencies', {}):
                collect(resolve_package(origin, dependency))

        collect(ROOT / 'packages/client/ui-remote-ops')
        collect(ROOT / 'packages/client/ui-ops-monitor')
        manifest = json.loads((stage / 'package.json').read_text())
        manifest['dependencies'] = visited
        manifest['bundledDependencies'] = list(visited)
        (stage / 'package.json').write_text(json.dumps(manifest, indent=2) + '\n')
        for manifest_path in stage.rglob('package.json'):
            if 'workspace:' in manifest_path.read_text():
                raise RuntimeError(f'Unresolved workspace reference: {manifest_path}')
        zip_path = OUTPUT / 'ops-suite-0.2.2-rc.2.zip'
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(stage.rglob('*')):
                if path.is_symlink():
                    raise RuntimeError(f'Unexpected symlink: {path}')
                if path.is_file():
                    archive.write(path, path.relative_to(work))
        tar_path = OUTPUT / 'ops-suite-0.2.2-rc.2.tgz'
        with tarfile.open(tar_path, 'w:gz') as archive:
            archive.add(stage, arcname='package')
        print(f'{len(visited)} bundled runtime packages\n{zip_path}\n{tar_path}')


if __name__ == '__main__':
    build()
