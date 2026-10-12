package com.lavi.apphub;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Process;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

final class AppStore {
    static final String[] CATEGORIES = {
        "Sosial & Chat","Belanja","Keuangan","Foto & Video","Hiburan","Musik & Audio",
        "Game","Produktivitas","Navigasi & Transportasi","Berita","Alat & Sistem","Lainnya"
    };
    static final String[] ACCENTS = {"Mint","Biru","Ungu","Jingga","Merah Muda"};
    static class Entry {
        String pkg, activity, name, category;
        ResolveInfo info;
        long lastUsed;
        int usageCount;
        boolean favorite, hidden, pinned, locked;
    }
    static class Web {
        String id,name,url,folder;
        boolean favorite;
        JSONObject json(){
            JSONObject j = new JSONObject();
            try {
                j.put("id",id);j.put("name",name);j.put("url",url);
                j.put("folder",folder);j.put("favorite",favorite);
            } catch(Exception ignored){}
            return j;
        }
        static Web from(JSONObject j) {
            Web w = new Web();
            w.id=j.optString("id","");
            w.name=j.optString("name","").trim();
            w.url=j.optString("url","").trim();
            w.folder=j.optString("folder","");
            w.favorite=j.optBoolean("favorite",false);
            return w;
        }
    }
    static class Folder {
        String id,name;
        ArrayList<String> appPkgs=new ArrayList<>();
        ArrayList<String> webIds=new ArrayList<>();
        JSONObject json() {
            JSONObject j=new JSONObject();
            try {
                j.put("id",id);j.put("name",name);
                j.put("apps",new JSONArray(appPkgs));j.put("webs",new JSONArray(webIds));
            }catch(Exception ignored){}
            return j;
        }
        static Folder from(JSONObject j) {
            Folder f=new Folder();
            f.id=j.optString("id","");
            f.name=j.optString("name","").trim();
            JSONArray apps=j.optJSONArray("apps");
            JSONArray webs=j.optJSONArray("webs");
            if(apps!=null)for(int i=0;i<apps.length();i++)f.appPkgs.add(apps.optString(i));
            if(webs!=null)for(int i=0;i<webs.length();i++)f.webIds.add(webs.optString(i));
            return f;
        }
    }
    final Context ctx;
    final SharedPreferences prefs;
    final ArrayList<Entry> apps=new ArrayList<>();
    final ArrayList<Web> websites=new ArrayList<>();
    final ArrayList<Folder> folders=new ArrayList<>();
    final Collator collator=Collator.getInstance(new Locale("id","ID"));

    AppStore(Context c){
        ctx=c.getApplicationContext();
        prefs=ctx.getSharedPreferences("lavi_apps",Context.MODE_PRIVATE);
        reloadData();
    }
    boolean bool(String k){ return prefs.getBoolean(k,false); }
    String setting(String k,String def){ return prefs.getString(k,def); }
    int number(String k,int def){ return prefs.getInt(k,def); }
    void put(String k, boolean b){prefs.edit().putBoolean(k,b).apply();}
    void put(String k, String v){prefs.edit().putString(k,v).apply();}
    void put(String k, int v){prefs.edit().putInt(k,v).apply();}
    void reloadData(){
        folders.clear(); websites.clear();
        try {
            JSONArray a=new JSONArray(setting("folders","[]"));
            for(int i=0;i<a.length()&&i<150;i++){
                Folder f=Folder.from(a.optJSONObject(i)==null?new JSONObject():a.getJSONObject(i));
                if(!f.id.isEmpty()&&!f.name.isEmpty())folders.add(f);
            }
        }catch(Exception ignored){}
        try {
            JSONArray a=new JSONArray(setting("websites","[]"));
            for(int i=0;i<a.length()&&i<350;i++){
                Web w=Web.from(a.optJSONObject(i)==null?new JSONObject():a.getJSONObject(i));
                if(!w.id.isEmpty()&&!w.name.isEmpty()&&validUrl(w.url)) websites.add(w);
            }
        }catch(Exception ignored){}
    }
    void saveCollections(){
        JSONArray fa=new JSONArray(),wa=new JSONArray();
        for(Folder f:folders)fa.put(f.json());
        for(Web w:websites)wa.put(w.json());
        put("folders",fa.toString());put("websites",wa.toString());
    }
    Folder findFolder(String id){for(Folder f:folders)if(f.id.equals(id))return f;return null;}
    Web findWeb(String id){for(Web w:websites)if(w.id.equals(id))return w;return null;}
    Entry findApp(String pkg){for(Entry a:apps)if(a.pkg.equals(pkg))return a;return null;}
    Folder addFolder(String name) {
        Folder f=new Folder();
        f.id=UUID.randomUUID().toString();f.name=name.trim();
        folders.add(f);saveCollections();return f;
    }
    void deleteFolder(Folder f){
        folders.remove(f);
        for(Web w:websites)if(f.id.equals(w.folder))w.folder="";
        saveCollections();
    }
    void moveAppToFolder(Entry a, Folder f){
        for(Folder other:folders)other.appPkgs.remove(a.pkg);
        if(!f.appPkgs.contains(a.pkg))f.appPkgs.add(a.pkg);
        saveCollections();
    }
    void removeFromFolder(Entry a,Folder f){f.appPkgs.remove(a.pkg);saveCollections();}
    void addWebToFolder(Web w,Folder f){w.folder=f.id;saveCollections();}
    void moveToCategory(Entry a,String cat){
        a.category=cat;
        put("cat:"+a.pkg,cat);
    }
    String autoCategory(String pkg,String name,ApplicationInfo info){
        String p=pkg.toLowerCase(Locale.ROOT),n=name.toLowerCase(Locale.ROOT);
        if(has(p,"openai.chatgpt")||has(n,"chatgpt"))return "Produktivitas";
        if(has(p,"whatsapp","telegram","instagram","facebook","messenger","signal","discord","twitter","snapchat","threads","linecorp","reddit","wechat","tiktok")||
            has(n,"whatsapp","telegram","instagram","facebook","discord","signal","messenger","chat"))return "Sosial & Chat";
        if(has(p,"shopee","tokopedia","lazada","blibli","bukalapak","aliexpress","amazon.shopping","zalora","shein")||
            has(n,"shopee","tokopedia","lazada","blibli","belanja"))return "Belanja";
        if(has(p,"bca","brimo","bri.mobile","bni","livin","mandiri","dana","gopay","ovo.id","linkaja","jenius","seabank","paypal","flip.id","banking")||
            has(n,"bank","dompet","keuangan","livin","brimo","gopay","dana","ovo","paypal"))return "Keuangan";
        if(has(p,"grab","gojek","maxim","google.android.apps.maps","waze","traveloka","tiket.android","uber","maps")||
            has(n,"maps","gojek","grab","waze","traveloka","navigasi"))return "Navigasi & Transportasi";
        if(has(p,"spotify","joox","soundcloud","shazam","podcast","music","audio","youtube.music")||
            has(n,"musik","music","spotify","audio","podcast"))return "Musik & Audio";
        if(has(p,"camera","gallery","photos","picsart","capcut","lightroom","snapseed","inshot","canva","photo.editor")||
            has(n,"kamera","camera","galeri","foto","photos","capcut","canva"))return "Foto & Video";
        if(has(p,"netflix","youtube","disney","primevideo","vidio","viu","iflix","iqiyi","twitch","bilibili","mxplayer")||
            has(n,"youtube","netflix","disney+","vidio","viu","prime video"))return "Hiburan";
        if(has(p,"game","roblox","minecraft","supercell","mobilelegends","garena","pubg","com.mihoyo")||
            has(n,"game","permainan","mobile legends","roblox","pubg"))return "Game";
        if(has(p,"gmail","calendar","docs","sheets","slides","drive","dropbox","notion","office","teams","zoom","meet","todoist","keep","chatgpt")||
            has(n,"kalender","calendar","drive","docs","office","zoom","chatgpt","catatan"))return "Produktivitas";
        if(has(p,"news","kompas","detik","tribun","cnn","bbc")||has(n,"berita","news"))return "Berita";
        if(has(p,"settings","calculator","clock","files","filemanager","security","phone","contacts","termux","browser","chrome","firefox","launcher","shortcut","systemui")||
            has(n,"pengaturan","kalkulator","jam","file","pengelola","telepon","kontak","chrome","browser","termux"))return "Alat & Sistem";
        if(info!=null){
            switch(info.category){
                case ApplicationInfo.CATEGORY_GAME:return "Game";
                case ApplicationInfo.CATEGORY_AUDIO:return "Musik & Audio";
                case ApplicationInfo.CATEGORY_VIDEO:return "Hiburan";
                case ApplicationInfo.CATEGORY_IMAGE:return "Foto & Video";
                case ApplicationInfo.CATEGORY_SOCIAL:return "Sosial & Chat";
                case ApplicationInfo.CATEGORY_NEWS:return "Berita";
                case ApplicationInfo.CATEGORY_MAPS:return "Navigasi & Transportasi";
                case ApplicationInfo.CATEGORY_PRODUCTIVITY:return "Produktivitas";
            }
        }
        return "Lainnya";
    }
    boolean has(String hay,String...s){for(String needle:s)if(hay.contains(needle))return true;return false;}
    List<Entry> scan(){
        List<Entry> found=new ArrayList<>();
        PackageManager pm=ctx.getPackageManager();
        Intent intent=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> launchables=pm.queryIntentActivities(intent,0);
        HashSet<String> seen=new HashSet<>();
        for(ResolveInfo ri:launchables){
            try{
                if(ri.activityInfo==null||!ri.activityInfo.enabled||!ri.activityInfo.applicationInfo.enabled)continue;
                String pkg=ri.activityInfo.packageName;
                if(pkg.equals(ctx.getPackageName())||!seen.add(pkg))continue;
                Entry a=new Entry();
                a.pkg=pkg;a.activity=ri.activityInfo.name;
                a.name=String.valueOf(ri.loadLabel(pm)).trim();
                if(a.name.isEmpty())a.name=pkg;
                a.info=ri;
                String manual=setting("cat:"+pkg,"");
                a.category=Arrays.asList(CATEGORIES).contains(manual)?manual:autoCategory(pkg,a.name,ri.activityInfo.applicationInfo);
                a.favorite=bool("fav:"+pkg);
                a.hidden=bool("hidden:"+pkg);
                a.pinned=bool("pinned:"+pkg);
                a.locked=bool("lock:"+pkg);
                a.lastUsed=prefs.getLong("recent:"+pkg,0);
                a.usageCount=prefs.getInt("launches:"+pkg,0);
                found.add(a);
            }catch(Exception ignored){}
        }
        if(usagePermission()) {
            for(Entry a:found){a.usageCount=0;a.lastUsed=0;}
            try {
                UsageStatsManager manager=(UsageStatsManager)ctx.getSystemService(Context.USAGE_STATS_SERVICE);
                long end=System.currentTimeMillis();
                UsageEvents events=manager.queryEvents(end-30L*86400000L,end);
                UsageEvents.Event event=new UsageEvents.Event();
                HashMap<String,Entry> lookup=new HashMap<>();
                for(Entry a:found)lookup.put(a.pkg,a);
                while(events.hasNextEvent()){
                    events.getNextEvent(event);
                    if(event.getEventType()==UsageEvents.Event.MOVE_TO_FOREGROUND){
                        Entry a=lookup.get(event.getPackageName());
                        if(a!=null){
                            a.usageCount++;
                            a.lastUsed=Math.max(a.lastUsed,event.getTimeStamp());
                        }
                    }
                }
            }catch(Exception ignored){}
        }
        Collections.sort(found,(a,b)->collator.compare(a.name,b.name));
        return found;
    }
    boolean usagePermission(){
        try {
            AppOpsManager a=(AppOpsManager)ctx.getSystemService(Context.APP_OPS_SERVICE);
            return a.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,Process.myUid(),ctx.getPackageName())
                ==AppOpsManager.MODE_ALLOWED;
        }catch(Exception e){return false;}
    }
    void setFlag(Entry a,String key,boolean value){
        put(key+":"+a.pkg,value);
        if(key.equals("fav"))a.favorite=value;
        if(key.equals("hidden"))a.hidden=value;
        if(key.equals("pinned"))a.pinned=value;
        if(key.equals("lock"))a.locked=value;
    }
    static boolean validUrl(String url){
        try{
            Uri2 u=new Uri2(url);
            return (u.scheme.equals("http")||u.scheme.equals("https"))&&!u.host.isEmpty()&&!url.contains(" ");
        }catch(Exception e){return false;}
    }
    private static class Uri2 {
        String scheme,host;
        Uri2(String input) throws Exception{
            java.net.URI u=new java.net.URI(input);
            scheme=u.getScheme()==null?"":u.getScheme().toLowerCase(Locale.ROOT);
            host=u.getHost()==null?"":u.getHost();
        }
    }
    JSONObject exportSettings() throws Exception{
        JSONObject root=new JSONObject();
        root.put("type","LAVI_APPS_BACKUP");root.put("version",2);
        JSONObject choices=new JSONObject();
        for(Map.Entry<String,?> e:prefs.getAll().entrySet()){
            String k=e.getKey();
            if(k.startsWith("fav:")||k.startsWith("pinned:")||k.startsWith("hidden:")||
               k.startsWith("cat:")||k.startsWith("lock:")||
               Arrays.asList("theme","accent","columns","icon_size","folder_style","sorting","biometric").contains(k)){
                choices.put(k,e.getValue());
            }
        }
        root.put("settings",choices);
        JSONArray fa=new JSONArray(),wa=new JSONArray();
        for(Folder f:folders)fa.put(f.json());
        for(Web w:websites)wa.put(w.json());
        root.put("folders",fa);root.put("websites",wa);
        root.put("note","Backup tidak menyimpan PIN. Atur kembali PIN untuk kunci aplikasi setelah restore.");
        return root;
    }
    void importSettings(String raw) throws Exception{
        if(raw.length()>512000)throw new IllegalArgumentException("File terlalu besar");
        JSONObject json=new JSONObject(raw);
        if(!"LAVI_APPS_BACKUP".equals(json.optString("type"))||json.optInt("version")<2)
            throw new IllegalArgumentException("Format backup tidak dikenali");
        JSONObject options=json.getJSONObject("settings");
        JSONArray fs=json.getJSONArray("folders"),ws=json.getJSONArray("websites");
        if(fs.length()>150||ws.length()>350)throw new IllegalArgumentException("Terlalu banyak item");
        ArrayList<Folder> importedFolders=new ArrayList<>();
        ArrayList<Web> importedWebs=new ArrayList<>();
        HashSet<String> ids=new HashSet<>();
        for(int i=0;i<fs.length();i++){
            Folder f=Folder.from(fs.getJSONObject(i));
            if(f.id.length()>100||f.name.length()>70||f.name.isEmpty()||!ids.add(f.id))continue;
            if(f.appPkgs.size()>500||f.webIds.size()>500)continue;
            importedFolders.add(f);
        }
        ids.clear();
        for(int i=0;i<ws.length();i++){
            Web w=Web.from(ws.getJSONObject(i));
            if(w.id.length()>100||w.name.length()>120||w.name.isEmpty()||!validUrl(w.url)||!ids.add(w.id))continue;
            importedWebs.add(w);
        }
        SharedPreferences.Editor edit=prefs.edit();
        // Keep PIN and its protections intact. Restore other preferences only.
        for(String k:prefs.getAll().keySet()){
            if(k.startsWith("fav:")||k.startsWith("pinned:")||k.startsWith("hidden:")||
                k.startsWith("cat:")||k.startsWith("lock:"))edit.remove(k);
        }
        for(java.util.Iterator<String> it=options.keys();it.hasNext();){
            String k=it.next();
            if(k.length()>210)continue;
            Object value=options.get(k);
            if((k.startsWith("fav:")||k.startsWith("pinned:")||k.startsWith("hidden:")||k.startsWith("lock:"))
               &&value instanceof Boolean){edit.putBoolean(k,(Boolean)value);}
            else if(k.startsWith("cat:")&&value instanceof String
                    &&Arrays.asList(CATEGORIES).contains(value)){edit.putString(k,(String)value);}
            else if(Arrays.asList("theme","accent","folder_style","sorting").contains(k)&&value instanceof String)
                edit.putString(k,(String)value);
            else if(Arrays.asList("columns","icon_size").contains(k)&&value instanceof Number)
                edit.putInt(k,((Number)value).intValue());
            else if(k.equals("biometric")&&value instanceof Boolean)edit.putBoolean(k,(Boolean)value);
        }
        JSONArray folderArray=new JSONArray(),webArray=new JSONArray();
        for(Folder f:importedFolders)folderArray.put(f.json());
        for(Web w:importedWebs)webArray.put(w.json());
        edit.putString("folders",folderArray.toString());
        edit.putString("websites",webArray.toString());
        edit.apply();reloadData();
    }
}
