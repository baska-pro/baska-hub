#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "registry" / "packages.tsv"
CATALOG = ROOT / "registry" / "catalog.json"
STATE = ROOT / "registry" / "repo-sync.json"
OVERRIDES = ROOT / "registry" / "overrides.json"
ASSETS = ROOT / "registry" / "assets.json"
MANIFEST = ROOT / "manifest.json"
OWNER = "baska-pro"
HUB_FULL_NAME = "baska-pro/baska-hub"

FIELDS = ["id","slug","aliases","name","category","type","version","platforms","source","action","sha256","description"]

def api_get(url: str, token: str | None = None, allow_404: bool = False):
    headers = {"Accept":"application/vnd.github+json","User-Agent":"baska-hub-sync/2.0","X-GitHub-Api-Version":"2022-11-28"}
    if token: headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp: return json.load(resp)
    except urllib.error.HTTPError as exc:
        if allow_404 and exc.code == 404: return None
        raise

def fetch_public_repositories(token):
    repos=[]; page=1
    while True:
        q=urllib.parse.urlencode({"per_page":100,"page":page,"sort":"created","direction":"desc","type":"owner"})
        data=api_get(f"https://api.github.com/users/{OWNER}/repos?{q}", token=token)
        if not data: break
        repos.extend(r for r in data if not r.get("private"))
        if len(data)<100: break
        page+=1
    repos=[r for r in repos if r.get("full_name","").lower()!=HUB_FULL_NAME.lower()]
    repos.sort(key=lambda r:(r.get("created_at") or "",r.get("id",0)), reverse=True)
    return repos

def root_contents(repo, token):
    data=api_get(f"https://api.github.com/repos/{repo['full_name']}/contents",token=token,allow_404=True)
    return data if isinstance(data,list) else []

def latest_release(repo, token):
    data=api_get(f"https://api.github.com/repos/{repo['full_name']}/releases/latest",token=token,allow_404=True)
    if not data: return None
    return {"tag_name":data.get("tag_name"),"name":data.get("name"),"published_at":data.get("published_at"),"html_url":data.get("html_url"),"assets":[{"name":a.get("name"),"size":a.get("size"),"download_url":a.get("browser_download_url")} for a in data.get("assets",[])]}

def slugify(name):
    slug=re.sub(r"[^a-z0-9-]+","-",name.lower().replace("_","-")); return re.sub(r"-+","-",slug).strip("-") or "repository"

def load_json(path, default):
    try:return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError,json.JSONDecodeError):return default

def infer_metadata(repo, files):
    names={x.get("name","") for x in files}; low={x.lower() for x in names}; topics=list(repo.get("topics") or []); language=repo.get("language"); tags=set(t.lower() for t in topics)
    if language: tags.add(language.lower())
    deps={"git"}; indicators=[]
    if "pyproject.toml" in low or "setup.py" in low or any(n.startswith("requirements") and n.endswith(".txt") for n in low): deps.add("python");indicators.append("python");tags.add("python")
    if "package.json" in low: deps.update(["node","npm"]);indicators.append("node");tags.add("node")
    if "dockerfile" in low or any(n in low for n in ("compose.yml","compose.yaml","docker-compose.yml","docker-compose.yaml")): deps.add("docker");indicators.append("docker");tags.add("docker")
    if "install.sh" in low: indicators.insert(0,"install.sh")
    if "install.ps1" in low: indicators.insert(0,"install.ps1");tags.add("powershell")
    joined=" ".join([repo["name"].lower()]+list(tags))
    if "windows" in joined or "win32" in joined or "pywin32" in joined: platforms=["windows"]
    elif "termux" in joined: platforms=["termux"]
    else: platforms=["all"]
    return {"platforms":platforms,"architectures":["all"],"dependencies":sorted(deps),"installer_indicators":indicators,"tags":sorted(tags),"status":"ready" if indicators else "repository_only","action":"smart" if indicators else "git","trust":"reviewed"}

def merge_override(package, override):
    result=dict(package)
    for key,value in override.items():
        if key=="tags": result["tags"]=sorted(set(result.get("tags",[]))|set(value))
        else: result[key]=value
    return result

def asset_packages():
    result=[]
    for asset in load_json(ASSETS,{"assets":[]}).get("assets",[]):
        p=dict(asset); local=ROOT/p.get("path","")
        if local.is_file():
            h=hashlib.sha256()
            with local.open("rb") as fh:
                for chunk in iter(lambda:fh.read(1024*1024),b""): h.update(chunk)
            p["sha256"]=h.hexdigest()
        p.setdefault("updated_at",p.get("created_at"));p.setdefault("preferred_delivery","raw");p.setdefault("latest_release",None);result.append(p)
    return result

def package_to_tsv(p):
    action=p.get("action","git")
    if p.get("recipe") and not action.startswith("recipe:"): action=f"recipe:{p['recipe']}"
    return {"id":p["id"],"slug":p["slug"],"aliases":",".join(p.get("aliases",[])),"name":p["name"],"category":p.get("category","repositories"),"type":p.get("type","repo"),"version":p.get("version","repo"),"platforms":",".join(p.get("platforms",["all"])),"source":p["source"],"action":action,"sha256":p.get("sha256") or "-","description":(p.get("description") or "").replace("\t"," ").replace("\n"," ")}

def write_tsv(packages):
    buf=io.StringIO();w=csv.DictWriter(buf,fieldnames=FIELDS,delimiter="\t",lineterminator="\n");w.writeheader()
    for p in packages:w.writerow(package_to_tsv(p))
    REGISTRY.write_text(buf.getvalue(),encoding="utf-8")

def build_public_package(repo, package_id, token, overrides):
    inferred=infer_metadata(repo,root_contents(repo,token));release=latest_release(repo,token);slug=slugify(repo["name"])
    p={"id":package_id,"slug":slug,"aliases":[slug.replace("-","")],"name":repo["name"],"category":"repositories","type":"repo","version":release.get("tag_name") if release and release.get("tag_name") else "repo","platforms":inferred["platforms"],"architectures":inferred["architectures"],"source":repo["clone_url"],"action":inferred["action"],"recipe":None,"sha256":None,"description":repo.get("description") or f"Public repository {repo['full_name']}.","visibility":"public","trust":inferred["trust"],"status":inferred["status"],"repository_id":repo["id"],"created_at":repo.get("created_at"),"updated_at":repo.get("updated_at"),"pushed_at":repo.get("pushed_at"),"language":repo.get("language"),"tags":inferred["tags"],"dependencies":inferred["dependencies"],"installer_indicators":inferred["installer_indicators"],"default_branch":repo.get("default_branch") or "main","latest_release":release,"preferred_delivery":"release" if release else "git","homepage":repo.get("homepage") or None,"archived":bool(repo.get("archived"))}
    p=merge_override(p,overrides.get(str(repo["id"])) or overrides.get(repo["full_name"]) or {})
    if p.get("recipe"):p["action"]=f"recipe:{p['recipe']}";p["status"]="ready"
    return p

def main():
    token=os.getenv("GITHUB_TOKEN") or None;repos=fetch_public_repositories(token);state=load_json(STATE,{"schema_version":2,"owner":OWNER,"public_id_anchor":50000,"next_public_id":50001,"repositories":{}});overrides=load_json(OVERRIDES,{"repositories":{}}).get("repositories",{});mapping=state.setdefault("repositories",{});next_id=int(state.get("next_public_id",50001))
    mapping={k:v for k,v in mapping.items() if not str(v.get("package_id","")).startswith("P")}
    packages=[]
    for repo in repos:
        key=str(repo["id"])
        if key not in mapping:
            mapping[key]={"package_id":f"{next_id:05d}","full_name":repo["full_name"],"created_at":repo.get("created_at")};print(f"NEW {next_id:05d} {repo['full_name']}");next_id+=1
        else:
            mapping[key]["full_name"]=repo["full_name"];mapping[key]["created_at"]=repo.get("created_at")
        packages.append(build_public_package(repo,mapping[key]["package_id"],token,overrides))
    packages.sort(key=lambda p:(p.get("created_at") or "",int(re.sub(r"\D","",p["id"]) or 0)),reverse=True);packages.extend(asset_packages())
    from datetime import datetime,timezone
    generated=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00","Z")
    CATALOG.write_text(json.dumps({"schema_version":3,"name":"BASKA Hub Catalog","owner":OWNER,"generated_at":generated,"private_policy":"Private repositories are never stored in this public catalog; they are discovered locally by `baska init`.","packages":packages},indent=2,ensure_ascii=False)+"\n",encoding="utf-8");write_tsv(packages)
    state["repositories"]=mapping;state["next_public_id"]=next_id;STATE.write_text(json.dumps(state,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    manifest={"schema_version":3,"name":"BASKA Hub","slug":"baska-hub","owner":OWNER,"default_branch":"main","cli":{"name":"baska","version":"1.0.0","path":"bin/baska"},"registry":{"catalog":"registry/catalog.json","index":"registry/packages.tsv","collections":"registry/collections.json","public_state":"registry/repo-sync.json","private":"local-only via baska init"},"id_policy":{"public":"5 digit chronology sequence; current newest anchor 50000, future repos increment","private":"Pxxxxx local-only","assets":"Axxxxx"},"features":["interactive-dashboard","smart-installer","platform-detection","install-update-remove-status-repair-rollback","version-management","dependency-resolver","release-first","sha256-provenance","categories-tags","profiles-collections","web-catalog"],"packages":packages}
    MANIFEST.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n",encoding="utf-8");print(f"SYNC OK: {len(repos)} public repos, next_public_id={next_id:05d}")

if __name__=="__main__":main()
