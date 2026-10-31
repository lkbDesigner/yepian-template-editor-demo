from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
out = root / 'deploy'
out.mkdir(exist_ok=True)
files = ['site-renderer.mjs','server/save-worker.mjs','cloudbase/server.mjs','cloudbase/service.mjs','cloudbase/store.mjs','cloudbase/schema.sql','cloudbase/DEPLOY.md']
with ZipFile(out / 'yepian-cloudbase.zip','w',ZIP_DEFLATED) as archive:
    archive.write(root/'cloudbase/Dockerfile','Dockerfile')
    for filename in files:
        archive.write(root/filename,filename)
print(out / 'yepian-cloudbase.zip')
