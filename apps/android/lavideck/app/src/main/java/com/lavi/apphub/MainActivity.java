package com.lavi.apphub;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.AppOpsManager;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.DragEvent;
import android.view.HapticFeedbackConstants;
import android.view.ViewGroup;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {
    private AppStore data;
    private SecureGate gate;
    private LinearLayout root, container, chips, tabs;
    private ScrollView mainScroll;
    private HorizontalScrollView categoryScroll;
    private ListView appList;
    private LinearLayout dragShelf;
    private final ArrayList<AppRow> appRows=new ArrayList<>();
    private final FastAppAdapter fastApps=new FastAppAdapter();
    private int appScrollIndex=0,appScrollOffset=0;
    private int searchShown=48;
    private long lastScanAt=0;
    private boolean previousUsagePermission=false;
    private TextView subtitle;
    private String tab="Beranda",category="Semua",folderId="",search="";
    private boolean showingHidden=false;
    private int bg,panel,stroke,txt,muted,accent,soft,accentText;
    private int cols=4,iconDp=49;
    private int generation=0;
    private boolean receiverRegistered=false;
    private final android.util.LruCache<String,Drawable.ConstantState> iconCache=
        new android.util.LruCache<>(64);
    private final String[] TAB_NAMES={"Beranda","Aplikasi","Folder","Website"};
    static class AppRow{
        String heading;
        ArrayList<AppStore.Entry> entries;
        AppRow(String label){heading=label;}
        AppRow(List<AppStore.Entry> list){entries=new ArrayList<>(list);}
    }
    private final class FastAppAdapter extends BaseAdapter {
        @Override public int getCount(){return appRows.size();}
        @Override public Object getItem(int i){return appRows.get(i);}
        @Override public long getItemId(int i){return i;}
        @Override public boolean areAllItemsEnabled(){return true;}
        @Override public boolean isEnabled(int i){return true;}
        @Override public int getViewTypeCount(){return 2;}
        @Override public int getItemViewType(int i){return appRows.get(i).heading!=null?0:1;}
        @Override public View getView(int pos,View recycled,ViewGroup parent){
            AppRow item=appRows.get(pos);
            if(item.heading!=null){
                TextView header;
                if(recycled instanceof TextView){header=(TextView)recycled;}
                else {
                    header=t("",14,txt,true);
                    header.setPadding(d(19),d(18),d(12),d(11));
                }
                header.setText(item.heading);
                header.setTextColor(txt);
                return header;
            }
            LinearLayout line;
            if(recycled instanceof LinearLayout){
                line=(LinearLayout)recycled;
                line.removeAllViews();
            }else line=row();
            line.setGravity(Gravity.TOP);
            line.setPadding(d(14),0,d(13),d(5));
            for(int j=0;j<cols;j++){
                LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);
                p.rightMargin=d(4);
                if(j<item.entries.size())line.addView(appTile(item.entries.get(j),null),p);
                else line.addView(new View(MainActivity.this),p);
            }
            return line;
        }
    }
    private final BroadcastReceiver packages=new BroadcastReceiver(){
        @Override public void onReceive(Context context,Intent i){reload();}
    };
    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        if(b!=null){
            tab=b.getString("tab","Beranda");
            category=b.getString("category","Semua");
            folderId=b.getString("folderId","");
            search=b.getString("search","");
            appScrollIndex=b.getInt("appScrollIndex",0);
            appScrollOffset=b.getInt("appScrollOffset",0);
        }
        data=new AppStore(this);
        gate=new SecureGate(this,data.prefs);
        createUI();
        IntentFilter f=new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REMOVED);
        f.addAction(Intent.ACTION_PACKAGE_REPLACED);
        f.addDataScheme("package");
        registerReceiver(packages,f);
        receiverRegistered=true;
        reload();
    }
    @Override protected void onSaveInstanceState(Bundle out){
        out.putString("tab",tab);out.putString("category",category);
        recordAppScroll();
        out.putString("folderId",folderId);out.putString("search",search);
        out.putInt("appScrollIndex",appScrollIndex);
        out.putInt("appScrollOffset",appScrollOffset);
        super.onSaveInstanceState(out);
    }
    @Override public void onResume(){
        super.onResume();
        if(data!=null&&!data.apps.isEmpty()){
            boolean allowed=data.usagePermission();
            if(allowed!=previousUsagePermission || SystemClock.elapsedRealtime()-lastScanAt>120000L)
                reload();
        }
    }
    @Override public void onDestroy(){
        generation++;
        if(receiverRegistered)try{unregisterReceiver(packages);}catch(Exception ignored){}
        super.onDestroy();
    }
    @Override public void onBackPressed(){
        if(!folderId.isEmpty()){folderId="";tab="Folder";refreshPage(false);return;}
        if(showingHidden){showingHidden=false;refreshPage(false);return;}
        if(!tab.equals("Beranda")){tab="Beranda";refreshPage(false);return;}
        super.onBackPressed();
    }
    private int d(int v){return (int)(v*getResources().getDisplayMetrics().density+.5f);}
    private LinearLayout.LayoutParams ll(int w,int h){
        return new LinearLayout.LayoutParams(w<0?w:d(w),h<0?h:d(h));
    }
    private GradientDrawable shape(int fill,int r,int line){
        GradientDrawable drawable=new GradientDrawable();
        drawable.setColor(fill);drawable.setCornerRadius(d(r));
        if(line!=0)drawable.setStroke(d(1),line);
        return drawable;
    }
    private LinearLayout row(){LinearLayout l=new LinearLayout(this);l.setOrientation(0);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    private LinearLayout col(){LinearLayout l=new LinearLayout(this);l.setOrientation(1);return l;}
    private TextView t(String s,int sp,int color,boolean bold){
        TextView v=new TextView(this);v.setText(s);v.setTextColor(color);v.setTextSize(sp);
        if(bold)v.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return v;
    }
    private void palette() {
        boolean light;
        String theme=data.setting("theme","Light");
        if(theme.equals("Sistem"))light=(getResources().getConfiguration().uiMode&
            Configuration.UI_MODE_NIGHT_MASK)!=Configuration.UI_MODE_NIGHT_YES;
        else light=theme.equals("Light");
        bg=Color.parseColor(light?"#F4F7FB":"#0E141C");
        panel=Color.parseColor(light?"#FFFFFF":"#192330");
        stroke=Color.parseColor(light?"#E1E7EF":"#293747");
        txt=Color.parseColor(light?"#162636":"#F6FAFD");
        muted=Color.parseColor(light?"#65768A":"#9BAFC1");
        soft=Color.parseColor(light?"#EAF0F6":"#202D3C");
        String a=data.setting("accent","Mint");
        String value=a.equals("Biru")?"#478EF5":a.equals("Ungu")?"#9373FF":
            a.equals("Jingga")?"#EF9344":a.equals("Merah Muda")?"#EC73A9":"#20BFA2";
        accent=Color.parseColor(value);
        accentText=Color.WHITE;
        cols=Math.max(3,Math.min(6,data.number("columns",4)));
        iconDp=Math.max(36,Math.min(70,data.number("icon_size",49)));
        getWindow().setStatusBarColor(bg);getWindow().setNavigationBarColor(bg);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        getWindow().getDecorView().setSystemUiVisibility(light ?
            (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR):0);
    }
    private void createUI(){
        final int previousY=mainScroll==null?0:mainScroll.getScrollY();
        final int previousX=categoryScroll==null?0:categoryScroll.getScrollX();
        palette();
        root=col();root.setBackgroundColor(bg);
        setContentView(root);
        LinearLayout top=row();
        top.setPadding(d(17),d(14),d(17),d(11));
        root.addView(top,ll(-1,-2));
        TextView logo=t("▦",27,accent,true);
        logo.setGravity(Gravity.CENTER);
        logo.setBackground(shape(soft,14,stroke));
        top.addView(logo,ll(46,46));
        LinearLayout titles=col();titles.setPadding(d(11),0,0,0);
        TextView brand=t("LaviDeck",22,txt,true);
        subtitle=t("Smart App Organizer · v2.1",11,muted,false);
        titles.addView(brand);titles.addView(subtitle);
        top.addView(titles,new LinearLayout.LayoutParams(0,-2,1));
        TextView add=actionSymbol("+","Tambah shortcut");
        top.addView(add,ll(40,42));
        add.setOnClickListener(v->quickAdd());
        TextView settings=actionSymbol("⚙","Pengaturan");
        LinearLayout.LayoutParams settingsP=ll(40,42);settingsP.leftMargin=d(7);
        top.addView(settings,settingsP);
        settings.setOnClickListener(v->showSettings());

        LinearLayout searchRow=row();
        searchRow.setPadding(d(17),0,d(17),d(10));
        root.addView(searchRow,ll(-1,-2));
        EditText input=new EditText(this);
        input.setSingleLine(true);
        input.setTextSize(14);
        input.setHint("⌕  Cari aplikasi, kategori, folder, website");
        input.setTextColor(txt);input.setHintTextColor(muted);
        input.setPadding(d(14),0,d(12),0);
        input.setBackground(shape(panel,13,stroke));
        input.setInputType(InputType.TYPE_CLASS_TEXT);
        input.setText(search);
        searchRow.addView(input,new LinearLayout.LayoutParams(0,d(48),1));
        input.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int st,int c,int a){}
            public void onTextChanged(CharSequence s,int st,int before,int count){
                String next=s.toString().toLowerCase(Locale.ROOT).trim();
                if(next.equals(search))return;
                search=next;searchShown=48;
                renderChips();renderBody();
            }
            public void afterTextChanged(Editable e){}
        });
        TextView refresh=actionSymbol("↻","Sinkronkan aplikasi");
        LinearLayout.LayoutParams rp=ll(44,47);rp.leftMargin=d(8);
        searchRow.addView(refresh,rp);
        refresh.setOnClickListener(v->reload());

        tabs=row();
        tabs.setPadding(d(13),0,d(13),d(8));
        root.addView(tabs,ll(-1,49));
        renderTabs();

        HorizontalScrollView hc=new HorizontalScrollView(this);
        hc.setHorizontalScrollBarEnabled(false);
        chips=row();
        chips.setPadding(d(17),0,d(9),d(8));
        hc.addView(chips);
        categoryScroll=hc;
        root.addView(hc,ll(-1,45));
        renderChips();

        dragShelf=row();
        dragShelf.setPadding(d(13),d(7),d(13),d(7));
        dragShelf.setBackground(shape(soft,13,stroke));
        TextView catDrop=dropChoice("⇄  Kategori");
        TextView folderDrop=dropChoice("▣  Folder");
        LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(0,d(48),1);
        cp.rightMargin=d(8);
        dragShelf.addView(catDrop,cp);
        dragShelf.addView(folderDrop,new LinearLayout.LayoutParams(0,d(48),1));
        dragTarget(catDrop,"choose:category");
        dragTarget(folderDrop,"choose:folder");
        dragShelf.setOnDragListener((v,e)->{
            if(e.getAction()==DragEvent.ACTION_DRAG_STARTED)
                return e.getLocalState() instanceof String;
            if(e.getAction()==DragEvent.ACTION_DRAG_ENDED){
                v.post(()->dragShelf.setVisibility(View.GONE));
            }
            return true;
        });
        dragShelf.setVisibility(View.GONE);
        LinearLayout.LayoutParams shelfP=ll(-1,62);
        shelfP.leftMargin=d(13);shelfP.rightMargin=d(13);
        root.addView(dragShelf,shelfP);

        ScrollView scroll=new ScrollView(this);
        scroll.setFillViewport(true);scroll.setVerticalScrollBarEnabled(false);
        container=col();
        container.setPadding(d(17),d(11),d(17),d(26));
        scroll.addView(container);
        mainScroll=scroll;
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        appList=new ListView(this);
        appList.setAdapter(fastApps);
        appList.setDivider(null);
        appList.setDividerHeight(0);
        appList.setCacheColorHint(Color.TRANSPARENT);
        appList.setVerticalScrollBarEnabled(true);
        appList.setFastScrollEnabled(true);
        appList.setScrollingCacheEnabled(true);
        appList.setItemsCanFocus(true);
        appList.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        appList.setClipToPadding(false);
        appList.setBackgroundColor(bg);
        appList.setVisibility(View.GONE);
        root.addView(appList,new LinearLayout.LayoutParams(-1,0,1));
        renderBody();
        restorePosition(previousY,previousX);
        applySystemInsets();
    }
    private TextView dropChoice(String label){
        TextView tv=t(label,14,txt,true);
        tv.setGravity(Gravity.CENTER);
        tv.setBackground(shape(panel,13,stroke));
        tv.setContentDescription("Lepaskan aplikasi untuk pindah ke "+label);
        return tv;
    }
    private void recordAppScroll(){
        if(appList==null || appList.getVisibility()!=View.VISIBLE)return;
        appScrollIndex=appList.getFirstVisiblePosition();
        View v=appList.getChildAt(0);
        appScrollOffset=v==null?0:v.getTop();
    }
    private void restoreAppScroll(){
        if(appList==null || appRows.isEmpty())return;
        final ListView list=appList;
        final int where=Math.max(0,Math.min(appScrollIndex,appRows.size()-1));
        final int offset=appScrollOffset;
        list.post(()->{
            if(list==appList && list.getVisibility()==View.VISIBLE)
                list.setSelectionFromTop(where,offset);
        });
    }
    private void showMoveShelf(){
        if(dragShelf!=null)dragShelf.setVisibility(View.VISIBLE);
    }
    private void hideMoveShelf(){
        if(dragShelf!=null)dragShelf.setVisibility(View.GONE);
    }
    private TextView actionSymbol(String symbol,String desc){
        TextView tv=t(symbol,22,accent,true);
        tv.setGravity(Gravity.CENTER);
        tv.setBackground(shape(panel,12,stroke));
        tv.setContentDescription(desc);
        return tv;
    }
    private TextView pill(String label,boolean active){
        TextView tv=t(label,12,active?accentText:muted,active);
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(d(11),0,d(11),0);
        tv.setBackground(shape(active?accent:panel,11,active?0:stroke));
        return tv;
    }
    /** Update content without reconstructing the activity view tree. */
    private void refreshPage(boolean keepBodyPosition){
        if(keepBodyPosition)recordAppScroll();
        final int y=keepBodyPosition&&mainScroll!=null?mainScroll.getScrollY():0;
        final int x=categoryScroll==null?0:categoryScroll.getScrollX();
        renderTabs();
        renderChips();
        renderBody();
        restorePosition(y,x);
        // No full-screen animation: avoid redraw cost on slower phones.
    }
    private void restorePosition(int y,int x){
        if(categoryScroll!=null){
            final HorizontalScrollView c=categoryScroll;
            c.post(()->{if(c==categoryScroll)c.scrollTo(x,0);});
        }
        if(mainScroll!=null){
            final ScrollView m=mainScroll;
            m.post(()->{if(m==mainScroll)m.scrollTo(0,y);});
        }
    }
    /** Handle Android 15+ edge-to-edge while preserving the app's own margins. */
    private void applySystemInsets(){
        if(root==null || android.os.Build.VERSION.SDK_INT<35)return;
        root.setOnApplyWindowInsetsListener((v,insets)->{
            int top=insets.getSystemWindowInsetTop();
            int bottom=insets.getSystemWindowInsetBottom();
            if(v.getPaddingTop()!=top || v.getPaddingBottom()!=bottom)
                v.setPadding(0,top,0,bottom);
            return insets.consumeSystemWindowInsets();
        });
        root.requestApplyInsets();
    }
    private void renderTabs(){
        if(tabs==null)return;
        tabs.removeAllViews();
        for(String name:TAB_NAMES){
            TextView v=pill(name,tab.equals(name));
            LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,d(37),1);
            p.leftMargin=d(3);p.rightMargin=d(3);
            tabs.addView(v,p);
            v.setOnClickListener(view->{
                if(tab.equals(name)&&folderId.isEmpty()&&!showingHidden)return;
                tab=name;folderId="";showingHidden=false;
                refreshPage(false);
            });
        }
    }
    private void renderChips() {
        if(chips==null)return;
        chips.removeAllViews();
        if(!search.isEmpty()){
            TextView hint=t("Hasil pencarian dari semua kategori",12,muted,false);
            chips.addView(hint,ll(-2,-2));return;
        }
        String[] leading={"Semua","Favorit","Disematkan"};
        for(String s:leading)chip(s,null);
        for(String s:AppStore.CATEGORIES){
            int count=0;
            for(AppStore.Entry e:data.apps)if(!e.hidden&&s.equals(e.category))count++;
            if(count>0)chip(s+" · "+count,s);
        }
        for(AppStore.Folder f:data.folders)chip("▣ "+f.name+" · "+f.appPkgs.size(),"folder:"+f.id);
    }
    private void chip(String display,String actual){
        final String selected=actual==null?display:actual;
        boolean active=category.equals(selected) && tab.equals("Aplikasi");
        TextView tv=pill(display,active);
        LinearLayout.LayoutParams p=ll(-2,35);p.rightMargin=d(7);
        chips.addView(tv,p);
        tv.setOnClickListener(v->{
            if(selected.startsWith("folder:")){
                folderId=selected.substring(7);tab="Folder";
            }else{category=selected;tab="Aplikasi";folderId="";}
            showingHidden=false;
            refreshPage(true);
        });
        if(Arrays.asList(AppStore.CATEGORIES).contains(selected))
            dragTarget(tv,"cat:"+selected);
        if(selected.startsWith("folder:"))dragTarget(tv,selected);
    }
    private void dragTarget(View v,String target){
        v.setOnDragListener((view,event)->{
            if(!(event.getLocalState() instanceof String))return false;
            String pkg=(String)event.getLocalState();
            switch(event.getAction()){
                case DragEvent.ACTION_DRAG_STARTED:return true;
                case DragEvent.ACTION_DRAG_ENTERED:
                    view.setAlpha(.60f);return true;
                case DragEvent.ACTION_DRAG_EXITED:
                case DragEvent.ACTION_DRAG_ENDED:
                    view.setAlpha(1f);return true;
                case DragEvent.ACTION_DROP:
                    view.setAlpha(1f);
                    // Finish the drag gesture before touching the view hierarchy/dialog.
                    view.post(()->handleDrop(pkg,target));
                    return true;
                default:return true;
            }
        });
    }
    private void handleDrop(String pkg,String target){
        hideMoveShelf();
        AppStore.Entry a=data.findApp(pkg);
        if(a==null){toast("Aplikasi tidak ditemukan");return;}
        if(target.equals("choose:category")){chooseCategory(a);return;}
        if(target.equals("choose:folder")){chooseFolder(a);return;}
        if(target.startsWith("cat:")){
            data.moveToCategory(a,target.substring(4));
            toast("Dipindahkan ke "+a.category);
        }else if(target.startsWith("folder:")){
            AppStore.Folder f=data.findFolder(target.substring(7));
            if(f==null){toast("Folder tidak ditemukan");return;}
            data.moveAppToFolder(a,f);
            toast("Ditambahkan ke "+f.name);
        }else return;
        refreshPage(true);
    }
    private void reload(){
        int id=++generation;
        if(subtitle!=null)subtitle.setText("Memindai aplikasi terpasang...");
        new Thread(()->{
            final List<AppStore.Entry> scanned=data.scan();
            runOnUiThread(()->{
                if(isFinishing()||id!=generation)return;
                data.apps.clear();data.apps.addAll(scanned);
                lastScanAt=SystemClock.elapsedRealtime();
                previousUsagePermission=data.usagePermission();
                refreshPage(true);
                if(subtitle!=null)subtitle.setText(data.apps.size()+" aplikasi · "+data.folders.size()+
                    " folder · "+data.websites.size()+" website");
            });
        },"lavi-app-scan").start();
    }
    private void renderBody(){
        if(container==null || data==null)return;
        boolean virtualApps=search.isEmpty()&&!showingHidden&&tab.equals("Aplikasi");
        if(virtualApps){
            mainScroll.setVisibility(View.GONE);
            appList.setVisibility(View.VISIBLE);
            renderFastApps();
            return;
        }
        if(appList!=null&&appList.getVisibility()==View.VISIBLE)recordAppScroll();
        if(appList!=null)appList.setVisibility(View.GONE);
        mainScroll.setVisibility(View.VISIBLE);
        container.removeAllViews();
        if(!search.isEmpty()){renderSearch();return;}
        if(showingHidden){renderHidden();return;}
        if(tab.equals("Beranda"))renderHome();
        else if(tab.equals("Aplikasi"))renderAllApps();
        else if(tab.equals("Folder"))renderFolders();
        else renderWebsites();
    }
    private void addAppRows(List<AppStore.Entry> entries){
        for(int i=0;i<entries.size();i+=cols){
            appRows.add(new AppRow(entries.subList(i,Math.min(i+cols,entries.size()))));
        }
    }
    /** Native ListView recycles only visible rows instead of eagerly constructing all icons. */
    private void renderFastApps(){
        List<AppStore.Entry> list=filtered(data.apps);
        appRows.clear();
        if(list.isEmpty()){
            appRows.add(new AppRow("Tidak ada aplikasi dalam kategori ini"));
        }else if(category.equals("Semua")){
            appRows.add(new AppRow("Semua aplikasi · "+list.size()));
            for(String group:AppStore.CATEGORIES){
                ArrayList<AppStore.Entry> items=new ArrayList<>();
                for(AppStore.Entry a:list)if(group.equals(a.category))items.add(a);
                if(!items.isEmpty()){
                    appRows.add(new AppRow(group+" · "+items.size()));
                    addAppRows(items);
                }
            }
        }else{
            appRows.add(new AppRow(category+" · "+list.size()+" aplikasi"));
            addAppRows(list);
        }
        fastApps.notifyDataSetChanged();
        restoreAppScroll();
    }
    private void section(String title,String desc){
        LinearLayout wrapper=col();
        TextView header=t(title,17,txt,true);
        wrapper.addView(header);
        if(desc!=null&&!desc.isEmpty()){
            TextView sub=t(desc,11,muted,false);
            LinearLayout.LayoutParams p=ll(-1,-2);p.topMargin=d(3);
            wrapper.addView(sub,p);
        }
        LinearLayout.LayoutParams par=ll(-1,-2);
        par.topMargin=d(13);par.bottomMargin=d(10);
        container.addView(wrapper,par);
    }
    private TextView smallButton(String title,Runnable onClick){
        TextView tv=t(title,12,accent,true);
        tv.setPadding(d(14),d(10),d(14),d(10));
        tv.setGravity(Gravity.CENTER);
        tv.setBackground(shape(soft,11,stroke));
        tv.setOnClickListener(v->onClick.run());
        return tv;
    }
    private void note(String message){
        TextView tv=t(message,13,muted,false);
        tv.setPadding(d(14),d(17),d(14),d(17));
        tv.setBackground(shape(panel,13,stroke));
        container.addView(tv,ll(-1,-2));
    }
    private List<AppStore.Entry> filtered(List<AppStore.Entry> entries){
        List<AppStore.Entry> result=new ArrayList<>();
        for(AppStore.Entry a:entries){
            if(a.hidden&&!showingHidden)continue;
            if(showingHidden&&!a.hidden)continue;
            if(!search.isEmpty()&&!includes(a.name,search)&&!includes(a.pkg,search)&&!includes(a.category,search))continue;
            if(category.equals("Favorit")&&!a.favorite)continue;
            if(category.equals("Disematkan")&&!a.pinned)continue;
            if(!category.equals("Semua")&&!category.equals("Favorit")&&!category.equals("Disematkan")
                &&!category.equals(a.category))continue;
            result.add(a);
        }
        sortEntries(result);
        return result;
    }
    private boolean includes(String s,String key){
        return s!=null&&s.toLowerCase(Locale.ROOT).contains(key);
    }
    private void sortEntries(List<AppStore.Entry> list){
        String mode=data.setting("sorting","A–Z");
        Collections.sort(list,(a,b)->{
            if(mode.equals("Paling sering")){
                int v=Integer.compare(b.usageCount,a.usageCount);
                if(v!=0)return v;
                v=Long.compare(b.lastUsed,a.lastUsed);if(v!=0)return v;
            } else if(mode.equals("Favorit dahulu")){
                int v=Boolean.compare(b.favorite,a.favorite);if(v!=0)return v;
            }
            return data.collator.compare(a.name,b.name);
        });
    }
    private void renderHome(){
        section("Selamat datang 👋","Shortcut favorit dan aplikasi penting dalam satu tempat");
        LinearLayout stats=row();
        stats.setPadding(d(14),d(15),d(14),d(15));
        stats.setBackground(shape(panel,14,stroke));
        TextView count=t("◈  "+data.apps.size()+" aplikasi",14,txt,true);
        stats.addView(count,new LinearLayout.LayoutParams(0,-2,1));
        TextView f=t("▣  "+data.folders.size()+" folder",13,accent,true);
        stats.addView(f);
        container.addView(stats,ll(-1,-2));
        List<AppStore.Entry> favorites=new ArrayList<>();
        List<AppStore.Entry> pinned=new ArrayList<>();
        for(AppStore.Entry a:data.apps){
            if(a.hidden)continue;
            if(a.pinned)pinned.add(a);
            if(a.favorite)favorites.add(a);
        }
        sortEntries(favorites);sortEntries(pinned);
        if(!pinned.isEmpty()){section("Disematkan","Aplikasi pilihan di beranda");gridApps(pinned,24,null);}
        if(!favorites.isEmpty()){section("★ Favorit","Akses sekali sentuh");gridApps(favorites,24,null);}
        if(favorites.isEmpty()&&pinned.isEmpty()){
            section("Mulai dari sini","Ketuk ⋮ pada aplikasi untuk menandainya sebagai favorit atau menyematkannya");
            note("Aplikasi Anda otomatis dikelompokkan di tab Aplikasi. Tekan dan tahan ikon untuk menyeretnya ke kategori atau folder.");
        }
        List<AppStore.Entry> recent=new ArrayList<>();
        for(AppStore.Entry a:data.apps)if(!a.hidden&&(a.lastUsed>0||data.prefs.getLong("recent:"+a.pkg,0L)>0))
            recent.add(a);
        recent.sort((a,b)->Long.compare(Math.max(b.lastUsed,data.prefs.getLong("recent:"+b.pkg,0)),
                                      Math.max(a.lastUsed,data.prefs.getLong("recent:"+a.pkg,0))));
        if(!recent.isEmpty()){
            section("Terakhir digunakan",data.usagePermission()?
                "Aktivitas Android 30 hari terakhir":"Riwayat shortcut yang dibuka melalui LaviDeck");
            gridApps(recent,Math.min(8,recent.size()),null);
        }
        if(!data.usagePermission()){
            section("Aplikasi paling sering digunakan",
                "Tanpa izin: penggunaan di LaviDeck saja. Izin opsional untuk seluruh perangkat.");
            List<AppStore.Entry> frequentLocal=new ArrayList<>();
            for(AppStore.Entry a:data.apps)if(!a.hidden&&a.usageCount>0)frequentLocal.add(a);
            frequentLocal.sort((a,b)->Integer.compare(b.usageCount,a.usageCount));
            if(!frequentLocal.isEmpty())gridApps(frequentLocal,8,null);
            container.addView(smallButton("Izinkan statistik penggunaan Android →",()->{
                try{startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));}
                catch(Exception e){toast("Pengaturan ini tidak didukung ponsel");}
            }),ll(-1,-2));
        }else {
            ArrayList<AppStore.Entry> frequent=new ArrayList<>();
            for(AppStore.Entry a:data.apps)if(!a.hidden&&a.usageCount>0)frequent.add(a);
            frequent.sort((a,b)->Integer.compare(b.usageCount,a.usageCount));
            if(!frequent.isEmpty()){section("Paling sering dipakai","Berdasarkan riwayat 30 hari");gridApps(frequent,8,null);}
        }
        if(!data.folders.isEmpty()){
            section("Folder Anda","Sentuh untuk membuka, seret ikon aplikasi untuk mengisi folder");
            folderCards(data.folders);
        }
        if(!data.websites.isEmpty()){
            section("Website favorit","Situs yang bisa dibuka seperti shortcut aplikasi");
            List<AppStore.Web> list=new ArrayList<>();
            for(AppStore.Web w:data.websites)if(w.favorite)list.add(w);
            gridWebs(list,8);
        }
    }
    private void renderAllApps(){
        List<AppStore.Entry> list=filtered(data.apps);
        section(category.equals("Semua")?"Semua aplikasi":category,
            list.size()+" aplikasi · "+cols+" kolom · tahan ikon untuk seret, tekan ⋮ untuk opsi");
        if(list.isEmpty()){note("Tidak ada aplikasi untuk kategori ini.");return;}
        if(category.equals("Semua")){
            for(String cat:AppStore.CATEGORIES){
                List<AppStore.Entry> group=new ArrayList<>();
                for(AppStore.Entry a:list)if(cat.equals(a.category))group.add(a);
                if(!group.isEmpty()){
                    section(cat,group.size()+" aplikasi");
                    gridApps(group,Integer.MAX_VALUE,null);
                }
            }
        }else gridApps(list,Integer.MAX_VALUE,null);
    }
    private void renderSearch(){
        String q=search;
        section("Hasil pencarian","Aplikasi, kategori, folder, dan shortcut website");
        List<AppStore.Entry> found=new ArrayList<>();
        for(AppStore.Entry a:data.apps)if(!a.hidden&&
            (includes(a.name,q)||includes(a.pkg,q)||includes(a.category,q)))found.add(a);
        sortEntries(found);
        if(!found.isEmpty()){
            section("Aplikasi · "+found.size(),"");
            gridApps(found,searchShown,null);
            if(found.size()>searchShown){
                container.addView(smallButton("Tampilkan "+Math.min(48,found.size()-searchShown)+
                    " aplikasi berikutnya",()->{
                    searchShown+=48;renderBody();
                }),ll(-1,-2));
            }
        }
        List<AppStore.Folder> folders=new ArrayList<>();
        for(AppStore.Folder f:data.folders)if(includes(f.name,q))folders.add(f);
        if(!folders.isEmpty()){section("Folder · "+folders.size(),"");folderCards(folders);}
        List<AppStore.Web> webs=new ArrayList<>();
        for(AppStore.Web w:data.websites)if(includes(w.name,q)||includes(w.url,q))webs.add(w);
        if(!webs.isEmpty()){section("Website · "+webs.size(),"");gridWebs(webs,Integer.MAX_VALUE);}
        if(found.isEmpty()&&folders.isEmpty()&&webs.isEmpty())note("Tidak ada hasil untuk “"+search+"”.");
    }
    private void renderHidden(){
        section("Aplikasi tersembunyi","Aplikasi hanya disembunyikan dari LaviDeck, tidak dihapus dari ponsel");
        int n=0;
        for(AppStore.Entry a:data.apps)if(a.hidden){
            n++;
            LinearLayout line=row();line.setPadding(d(12),d(7),d(12),d(7));
            TextView name=t(a.name,14,txt,true);
            line.addView(name,new LinearLayout.LayoutParams(0,-2,1));
            line.addView(smallButton("Tampilkan",()->{
                data.setFlag(a,"hidden",false);renderChips();renderBody();
            }));
            container.addView(line,ll(-1,49));
        }
        if(n==0)note("Belum ada aplikasi yang disembunyikan.");
        container.addView(smallButton("Selesai",()->{showingHidden=false;createUI();}),ll(-1,-2));
    }
    private void renderFolders(){
        if(!folderId.isEmpty()){
            AppStore.Folder f=data.findFolder(folderId);
            if(f==null){folderId="";renderFolders();return;}
            LinearLayout head=row();
            TextView back=smallButton("← Folder",()->{folderId="";renderBody();});
            head.addView(back,new LinearLayout.LayoutParams(0,-2,1));
            head.addView(smallButton("⋮ Kelola",()->folderOptions(f)),ll(-2,-2));
            container.addView(head,ll(-1,-2));
            section("▣ "+f.name,"Seret ikon aplikasi ke chip folder untuk memasukkannya");
            List<AppStore.Entry> entries=new ArrayList<>();
            for(String pkg:f.appPkgs){
                AppStore.Entry a=data.findApp(pkg);
                if(a!=null&&!a.hidden)entries.add(a);
            }
            sortEntries(entries);
            if(!entries.isEmpty())gridApps(entries,Integer.MAX_VALUE,f);
            List<AppStore.Web> webs=new ArrayList<>();
            for(AppStore.Web w:data.websites)if(f.id.equals(w.folder))webs.add(w);
            if(!webs.isEmpty()){section("Website dalam folder","");gridWebs(webs,Integer.MAX_VALUE);}
            if(entries.isEmpty()&&webs.isEmpty())note("Folder kosong. Buka tab Aplikasi, tahan ikon untuk seret lalu lepaskan pada chip folder di atas.");
            container.addView(smallButton("Tambah website ke folder",()->editWebsite(null,f)),ll(-1,-2));
            return;
        }
        section("Folder & Koleksi","Buat folder sendiri, isi aplikasi dan situs web");
        container.addView(smallButton("+ Buat folder baru",()->editFolder(null)),ll(-1,-2));
        if(data.folders.isEmpty()){
            LinearLayout.LayoutParams p=ll(-1,-2);p.topMargin=d(14);
            TextView hint=t("Belum ada folder pribadi. Kategori otomatis tetap tersedia di tab Aplikasi.",13,muted,false);
            container.addView(hint,p);
        }else folderCards(data.folders);
        section("Kategori otomatis","Kategori sistem berdasarkan nama dan metadata aplikasi");
        for(String cat:AppStore.CATEGORIES){
            int n=0;for(AppStore.Entry a:data.apps)if(cat.equals(a.category)&&!a.hidden)n++;
            if(n==0)continue;
            LinearLayout r=row();r.setPadding(d(13),d(13),d(13),d(13));
            r.setBackground(shape(panel,12,stroke));
            TextView name=t(cat,13,txt,true);
            r.addView(name,new LinearLayout.LayoutParams(0,-2,1));
            r.addView(t(n+"  ›",12,accent,true));
            LinearLayout.LayoutParams p=ll(-1,-2);p.bottomMargin=d(7);
            container.addView(r,p);
            final String c=cat;
            r.setOnClickListener(v->{
                category=c;tab="Aplikasi";folderId="";
                refreshPage(true);
            });
            dragTarget(r,"cat:"+cat);
        }
    }
    private void renderWebsites(){
        section("Shortcut Website","Simpan tautan situs web, buka langsung melalui browser");
        container.addView(smallButton("+ Tambahkan website",()->editWebsite(null,null)),ll(-1,-2));
        if(data.websites.isEmpty()) {
            section("Belum ada website","");
            note("Tambahkan URL seperti https://example.com. Situs juga dapat dimasukkan ke folder dan ditambahkan ke layar utama.");
        }else {section("Koleksi website · "+data.websites.size(),"");gridWebs(data.websites,Integer.MAX_VALUE);}
    }
    private void gridApps(List<AppStore.Entry> values,int max,AppStore.Folder folder){
        if(values.isEmpty())return;
        int limit=Math.min(values.size(),max);
        for(int k=0;k<limit;k+=cols){
            LinearLayout line=row();line.setGravity(Gravity.TOP);
            for(int c=0;c<cols;c++){
                int ix=k+c;
                if(ix<limit){
                    AppStore.Entry a=values.get(ix);
                    LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);
                    p.rightMargin=d(4);p.bottomMargin=d(5);
                    line.addView(appTile(a,folder),p);
                }else{
                    View space=new View(this);
                    line.addView(space,new LinearLayout.LayoutParams(0,d(95),1));
                }
            }
            container.addView(line,ll(-1,-2));
        }
    }
    private View appTile(AppStore.Entry a,AppStore.Folder folder){
        LinearLayout card=col();
        card.setGravity(Gravity.TOP|Gravity.CENTER_HORIZONTAL);
        card.setPadding(d(2),d(8),d(2),d(5));
        card.setBackground(shape(panel,12,0));
        LinearLayout top=row();
        top.setGravity(Gravity.CENTER);
        ImageView image=new ImageView(this);
        try{
            Drawable.ConstantState state=iconCache.get(a.pkg);
            if(state!=null)image.setImageDrawable(state.newDrawable(getResources()));
            else {
                Drawable loaded=a.info.loadIcon(getPackageManager());
                image.setImageDrawable(loaded);
                if(loaded.getConstantState()!=null)iconCache.put(a.pkg,loaded.getConstantState());
            }
        }catch(Exception e){image.setImageResource(android.R.drawable.sym_def_app_icon);}
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        int iconWidth=Math.min(iconDp,cols>=6?39:cols==5?44:iconDp);
        top.addView(image,ll(iconWidth,iconWidth));
        LinearLayout.LayoutParams tp=ll(-1,-2);
        tp.topMargin=d(2);card.addView(top,tp);
        TextView name=t(a.name,cols>=6?9:11,txt,false);
        name.setGravity(Gravity.CENTER);
        name.setMaxLines(2);
        name.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams np=ll(-1,33);np.topMargin=d(5);
        card.addView(name,np);
        LinearLayout actions=row();
        actions.setGravity(Gravity.CENTER);
        if(a.favorite||a.locked||a.pinned){
            String symbols=(a.favorite?"★ ":"")+(a.pinned?"◆ ":"")+(a.locked?"⌑":"");
            TextView stars=t(symbols,10,accent,true);
            stars.setGravity(Gravity.CENTER);
            actions.addView(stars,new LinearLayout.LayoutParams(0,d(22),1));
        }else{
            View sp=new View(this);
            actions.addView(sp,new LinearLayout.LayoutParams(0,d(22),1));
        }
        TextView more=t("⋮",20,muted,true);
        more.setGravity(Gravity.CENTER);
        more.setContentDescription("Opsi "+a.name);
        actions.addView(more,ll(25,26));
        more.setOnClickListener(v->appOptions(a,more,folder));
        card.addView(actions,ll(-1,26));
        card.setContentDescription(a.name+"; "+a.category);
        card.setOnClickListener(v->openApp(a));
        card.setOnLongClickListener(v->{
            v.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
            showMoveShelf();
            ClipData payload=ClipData.newPlainText("LaviDeck",a.pkg);
            boolean started=v.startDragAndDrop(payload,new View.DragShadowBuilder(v),a.pkg,0);
            if(!started){
                hideMoveShelf();
                new AlertDialog.Builder(this).setTitle("Pindahkan "+a.name)
                    .setItems(new String[]{"Ubah kategori","Masukkan ke folder"},(dlg,i)->{
                        if(i==0)chooseCategory(a);
                        else chooseFolder(a);
                    }).show();
            }
            return true;
        });
        return card;
    }
    private void gridWebs(List<AppStore.Web> websites,int max){
        int n=Math.min(websites.size(),max);
        for(int start=0;start<n;start+=cols){
            LinearLayout line=row();line.setGravity(Gravity.TOP);
            for(int c=0;c<cols;c++){
                if(start+c<n){
                    AppStore.Web w=websites.get(start+c);
                    LinearLayout item=col();
                    item.setGravity(Gravity.CENTER_HORIZONTAL);
                    item.setPadding(d(3),d(10),d(3),d(4));
                    item.setBackground(shape(panel,12,0));
                    TextView symbol=t("🌐",Math.min(iconDp,48),accent,true);
                    symbol.setGravity(Gravity.CENTER);
                    item.addView(symbol,ll(-1,iconDp+2));
                    TextView label=t(w.name,11,txt,false);
                    label.setMaxLines(2);label.setEllipsize(TextUtils.TruncateAt.END);
                    label.setGravity(Gravity.CENTER);
                    item.addView(label,ll(-1,37));
                    TextView more=t("⋮",19,muted,true);
                    more.setGravity(Gravity.CENTER);
                    more.setContentDescription("Opsi website "+w.name);
                    item.addView(more,ll(-1,27));
                    more.setOnClickListener(v->webOptions(w,more));
                    item.setOnClickListener(v->openWeb(w));
                    LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);
                    p.rightMargin=d(5);p.bottomMargin=d(5);
                    line.addView(item,p);
                }else line.addView(new View(this),new LinearLayout.LayoutParams(0,d(90),1));
            }
            container.addView(line,ll(-1,-2));
        }
    }
    private void folderCards(List<AppStore.Folder> folders){
        boolean compact=data.setting("folder_style","Kartu").equals("Ringkas");
        for(AppStore.Folder f:folders){
            LinearLayout card=row();
            card.setPadding(d(13),d(compact?11:17),d(13),d(compact?11:17));
            card.setBackground(shape(panel,13,stroke));
            TextView symbol=t("▣",compact?23:27,accent,true);
            card.addView(symbol,ll(41,42));
            LinearLayout info=col();
            TextView title=t(f.name,15,txt,true);
            TextView details=t(f.appPkgs.size()+" aplikasi · "+countWebs(f)+" website",11,muted,false);
            info.addView(title);info.addView(details);
            card.addView(info,new LinearLayout.LayoutParams(0,-2,1));
            TextView more=t("⋮",23,muted,true);
            more.setGravity(Gravity.CENTER);
            more.setContentDescription("Kelola folder "+f.name);
            card.addView(more,ll(34,38));
            more.setOnClickListener(v->folderOptions(f));
            card.setOnClickListener(v->{folderId=f.id;tab="Folder";createUI();});
            dragTarget(card,"folder:"+f.id);
            LinearLayout.LayoutParams p=ll(-1,-2);p.bottomMargin=d(8);
            container.addView(card,p);
        }
    }
    private int countWebs(AppStore.Folder f){
        int n=0;for(AppStore.Web w:data.websites)if(f.id.equals(w.folder))n++;return n;
    }
    private void openApp(AppStore.Entry a){
        Runnable launch=()->{
            try{
                String activity=a.activity.startsWith(".")?a.pkg+a.activity:a.activity;
                Intent intent=new Intent(Intent.ACTION_MAIN);
                intent.addCategory(Intent.CATEGORY_LAUNCHER);
                intent.setComponent(new ComponentName(a.pkg,activity));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                startActivity(intent);
                int count=data.prefs.getInt("launches:"+a.pkg,0);
                data.prefs.edit().putLong("recent:"+a.pkg,System.currentTimeMillis())
                    .putInt("launches:"+a.pkg,Math.min(100000,count+1)).apply();
                a.usageCount++;
            }catch(Exception e){toast("Gagal membuka "+a.name+". Coba sinkronkan daftar aplikasi.");}
        };
        if(a.locked)gate.authenticate(launch);else launch.run();
    }
    private void openWeb(AppStore.Web w){
        if(!AppStore.validUrl(w.url)){toast("URL website tidak valid");return;}
        try{
            startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(w.url))
                .addCategory(Intent.CATEGORY_BROWSABLE));
        }catch(Exception e){toast("Tidak ditemukan browser untuk membuka website");}
    }
    private void appOptions(AppStore.Entry a,View anchor,AppStore.Folder within){
        PopupMenu p=new PopupMenu(this,anchor);
        p.getMenu().add(0,1,0,a.favorite?"★ Hapus favorit":"☆ Tambah favorit");
        p.getMenu().add(0,2,1,a.pinned?"Lepas dari Beranda":"Sematkan di Beranda");
        p.getMenu().add(0,3,2,"Ubah kategori");
        p.getMenu().add(0,4,3,"Masukkan ke folder");
        if(within!=null)p.getMenu().add(0,9,4,"Keluarkan dari folder");
        p.getMenu().add(0,5,5,a.locked?"Nonaktifkan pengunci":"Kunci dengan PIN/biometrik");
        p.getMenu().add(0,6,6,"Sembunyikan aplikasi");
        p.getMenu().add(0,7,7,"Pintasan ke layar utama");
        p.getMenu().add(0,8,8,"Info aplikasi");
        p.setOnMenuItemClickListener(item->{
            switch(item.getItemId()){
                case 1:data.setFlag(a,"fav",!a.favorite);renderChips();renderBody();return true;
                case 2:data.setFlag(a,"pinned",!a.pinned);renderChips();renderBody();return true;
                case 3:chooseCategory(a);return true;
                case 4:chooseFolder(a);return true;
                case 9:
                    data.removeFromFolder(a,within);renderBody();return true;
                case 5:
                    if(a.locked){
                        gate.authenticate(()->{
                            data.setFlag(a,"lock",false);renderBody();
                        });
                    }else gate.authenticate(()->{
                        data.setFlag(a,"lock",true);renderBody();
                    });
                    return true;
                case 6:data.setFlag(a,"hidden",true);renderChips();renderBody();return true;
                case 7:
                    if(a.locked){
                        new AlertDialog.Builder(this).setTitle("Shortcut tidak terlindungi")
                            .setMessage("Pintasan layar utama akan langsung membuka aplikasi tanpa PIN LaviDeck. Tetap buat?")
                            .setNegativeButton("Batal",null)
                            .setPositiveButton("Buat",(d,i)->pinApp(a)).show();
                    }else pinApp(a);
                    return true;
                case 8:
                    try{startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:"+a.pkg)));}catch(Exception e){toast("Tidak bisa membuka info aplikasi");}
                    return true;
            }
            return false;
        });p.show();
    }
    private void chooseCategory(AppStore.Entry a){
        int current=Arrays.asList(AppStore.CATEGORIES).indexOf(a.category);
        new AlertDialog.Builder(this).setTitle("Kategori: "+a.name)
            .setSingleChoiceItems(AppStore.CATEGORIES,current,(dlg,i)->{
                data.moveToCategory(a,AppStore.CATEGORIES[i]);dlg.dismiss();
                renderChips();renderBody();
            })
            .setNeutralButton("Otomatis",(dlg,i)->{
                data.prefs.edit().remove("cat:"+a.pkg).apply();
                a.category=data.autoCategory(a.pkg,a.name,a.info.activityInfo.applicationInfo);
                renderChips();renderBody();
            }).setNegativeButton("Batal",null).show();
    }
    private void chooseFolder(AppStore.Entry a){
        if(data.folders.isEmpty()){
            new AlertDialog.Builder(this).setTitle("Belum ada folder")
                .setMessage("Buat folder baru sebelum memasukkan aplikasi.")
                .setPositiveButton("Buat folder",(dlg,i)->editFolder(a))
                .setNegativeButton("Batal",null).show();
            return;
        }
        String[] options=new String[data.folders.size()+1];
        for(int i=0;i<data.folders.size();i++)options[i]=data.folders.get(i).name;
        options[options.length-1]="+ Folder baru";
        new AlertDialog.Builder(this).setTitle("Masukkan "+a.name+" ke folder")
            .setItems(options,(dialog,pos)->{
                if(pos>=data.folders.size()){editFolder(a);return;}
                AppStore.Folder f=data.folders.get(pos);
                data.moveAppToFolder(a,f);
                renderChips();renderBody();toast("Dipindahkan ke "+f.name);
            }).setNegativeButton("Batal",null).show();
    }
    private EditText field(String hint,String value){
        EditText input=new EditText(this);
        input.setHint(hint);input.setSingleLine(true);
        input.setTextColor(txt);input.setHintTextColor(muted);
        input.setTextSize(15);
        input.setText(value);
        return input;
    }
    private void editFolder(AppStore.Entry toAdd){
        EditText input=field("Nama folder, contoh: Kerja","");
        LinearLayout l=col();l.setPadding(d(24),d(4),d(24),0);
        l.addView(input);
        AlertDialog dlg=new AlertDialog.Builder(this).setTitle("Folder baru")
            .setView(l).setPositiveButton("Buat",null)
            .setNegativeButton("Batal",null).create();
        dlg.setOnShowListener(v->dlg.getButton(-1).setOnClickListener(view->{
            String name=input.getText().toString().trim();
            if(name.isEmpty()||name.length()>70){input.setError("Nama 1–70 karakter");return;}
            AppStore.Folder f=data.addFolder(name);
            if(toAdd!=null)data.moveAppToFolder(toAdd,f);
            dlg.dismiss();renderChips();renderBody();
        }));
        dlg.show();
    }
    private void folderOptions(AppStore.Folder f){
        String[] options={"Buka folder","Ganti nama","Tambah website","Hapus folder"};
        new AlertDialog.Builder(this).setTitle("Kelola "+f.name)
            .setItems(options,(dlg,which)->{
                if(which==0){folderId=f.id;tab="Folder";createUI();}
                else if(which==1){
                    EditText input=field("Nama folder",f.name);
                    new AlertDialog.Builder(this).setTitle("Ganti nama")
                        .setView(input).setPositiveButton("Simpan",(d,i)->{
                            String name=input.getText().toString().trim();
                            if(name.length()>0&&name.length()<=70){f.name=name;data.saveCollections();createUI();}
                        }).setNegativeButton("Batal",null).show();
                }else if(which==2)editWebsite(null,f);
                else new AlertDialog.Builder(this).setTitle("Hapus "+f.name+"?")
                    .setMessage("Shortcut aplikasi tidak dihapus dari ponsel. Situs dalam folder tetap tersimpan.")
                    .setNegativeButton("Batal",null)
                    .setPositiveButton("Hapus",(d,i)->{
                        data.deleteFolder(f);
                        if(folderId.equals(f.id))folderId="";
                        createUI();
                    }).show();
            }).show();
    }
    private void quickAdd(){
        new AlertDialog.Builder(this).setTitle("Tambahkan ke LaviDeck")
            .setItems(new String[]{"Website / URL","Folder pribadi"},(d,i)->{
                if(i==0)editWebsite(null,null);
                else editFolder(null);
            }).show();
    }
    private void editWebsite(AppStore.Web existing,AppStore.Folder folder){
        LinearLayout form=col();form.setPadding(d(24),d(6),d(24),0);
        EditText name=field("Nama website",existing==null?"":existing.name);
        EditText url=field("https://contoh.com",existing==null?"":existing.url);
        url.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);
        form.addView(name,ll(-1,53));form.addView(url,ll(-1,53));
        AlertDialog dlg=new AlertDialog.Builder(this)
            .setTitle(existing==null?"Tambah website":"Ubah website")
            .setView(form).setPositiveButton("Simpan",null)
            .setNegativeButton("Batal",null).create();
        dlg.setOnShowListener(v->dlg.getButton(-1).setOnClickListener(view->{
            String n=name.getText().toString().trim();
            String u=url.getText().toString().trim();
            if(n.isEmpty()||n.length()>120){name.setError("Nama 1–120 karakter");return;}
            if(!u.contains("://"))u="https://"+u;
            if(!AppStore.validUrl(u)){url.setError("Gunakan URL http:// atau https:// yang valid");return;}
            AppStore.Web web=existing==null?new AppStore.Web():existing;
            if(existing==null){
                web.id=java.util.UUID.randomUUID().toString();
                web.favorite=false;
                web.folder=folder==null?"":folder.id;
                data.websites.add(web);
            }
            web.name=n;web.url=u;
            if(folder!=null)web.folder=folder.id;
            data.saveCollections();dlg.dismiss();renderChips();renderBody();
        }));
        dlg.show();
    }
    private void webOptions(AppStore.Web web,View anchor){
        PopupMenu p=new PopupMenu(this,anchor);
        p.getMenu().add(0,1,0,web.favorite?"Hapus dari favorit":"Tambah ke favorit");
        p.getMenu().add(0,2,1,"Ubah website");
        p.getMenu().add(0,3,2,"Masukkan ke folder");
        p.getMenu().add(0,4,3,"Pintasan ke layar utama");
        p.getMenu().add(0,5,4,"Hapus website");
        p.setOnMenuItemClickListener(item->{
            switch(item.getItemId()){
                case 1:web.favorite=!web.favorite;data.saveCollections();renderBody();return true;
                case 2:editWebsite(web,null);return true;
                case 3:
                    if(data.folders.isEmpty()){editFolder(null);return true;}
                    String[] folders=new String[data.folders.size()+1];
                    folders[0]="Tanpa folder";
                    for(int i=0;i<data.folders.size();i++)folders[i+1]=data.folders.get(i).name;
                    new AlertDialog.Builder(this).setTitle("Pilih folder")
                        .setItems(folders,(dlg,pos)->{
                            web.folder=pos==0?"":data.folders.get(pos-1).id;
                            data.saveCollections();renderBody();
                        }).show();return true;
                case 4:pinWeb(web);return true;
                case 5:
                    new AlertDialog.Builder(this).setTitle("Hapus shortcut "+web.name+"?")
                        .setNegativeButton("Batal",null)
                        .setPositiveButton("Hapus",(dlg,i)->{
                            data.websites.remove(web);data.saveCollections();renderBody();
                        }).show();return true;
            }
            return false;
        });p.show();
    }
    private void showSettings(){
        String mode=data.setting("theme","Light");
        String[] menu={
            "Tampilan: "+mode+" (Dark / Light / Sistem)",
            "Warna aksen: "+data.setting("accent","Mint"),
            "Kolom grid: "+cols,
            "Ukuran ikon: "+iconDp+" dp",
            "Gaya folder: "+data.setting("folder_style","Kartu"),
            "Urutan: "+data.setting("sorting","A–Z"),
            "Kelola aplikasi tersembunyi",
            "Atur / ganti PIN pengunci",
            "Biometrik: "+(data.bool("biometric")?"Aktif":"Nonaktif"),
            "Akses penggunaan: "+(data.usagePermission()?"Diizinkan":"Belum diizinkan"),
            "Ekspor backup konfigurasi",
            "Impor backup konfigurasi",
            "Privasi & info aplikasi"
        };
        new AlertDialog.Builder(this).setTitle("Pengaturan LaviDeck")
            .setItems(menu,(dlg,i)->{
                switch(i){
                    case 0: chooseOption("Tema",new String[]{"Dark","Light","Sistem"},
                        data.setting("theme","Light"),v->{data.put("theme",v);createUI();});break;
                    case 1: chooseOption("Warna aksen",AppStore.ACCENTS,
                        data.setting("accent","Mint"),v->{data.put("accent",v);createUI();});break;
                    case 2: {
                        String[] c={"3","4","5","6"};
                        chooseOption("Jumlah kolom",c,String.valueOf(cols),v->{
                            data.put("columns",Integer.parseInt(v));createUI();
                        });break;
                    }
                    case 3: {
                        String[] sizes={"36","42","49","56","64","70"};
                        chooseOption("Ukuran ikon (dp)",sizes,String.valueOf(iconDp),v->{
                            data.put("icon_size",Integer.parseInt(v));createUI();
                        });break;
                    }
                    case 4: chooseOption("Gaya folder",new String[]{"Kartu","Ringkas"},
                        data.setting("folder_style","Kartu"),v->{data.put("folder_style",v);createUI();});break;
                    case 5: chooseOption("Urutkan aplikasi",new String[]{"A–Z","Favorit dahulu","Paling sering"},
                        data.setting("sorting","A–Z"),v->{data.put("sorting",v);renderBody();});break;
                    case 6:showingHidden=true;search="";createUI();break;
                    case 7:gate.setup(()->toast("PIN pengunci aktif"));break;
                    case 8:
                        if(!gate.configured()){
                            new AlertDialog.Builder(this).setTitle("Perlu PIN")
                                .setMessage("Atur PIN sebelum mengaktifkan biometrik.")
                                .setPositiveButton("Atur PIN",(d,w)->gate.setup(()->{
                                    data.put("biometric",true);
                                    toast("Biometrik aktif jika perangkat mendukung");
                                })).setNegativeButton("Batal",null).show();
                        }else{
                            data.put("biometric",!data.bool("biometric"));
                            toast(data.bool("biometric")?"Biometrik diaktifkan":"Biometrik dinonaktifkan");
                        }
                        break;
                    case 9:
                        try{startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));}
                        catch(Exception e){toast("Pengaturan penggunaan tidak tersedia");}
                        break;
                    case 10:exportBackup();break;
                    case 11:importBackup();break;
                    case 12:showAbout();break;
                }
            }).setNegativeButton("Tutup",null).show();
    }
    private interface Choice {void selected(String s);}
    private void chooseOption(String title,String[] options,String current,Choice callback){
        new AlertDialog.Builder(this).setTitle(title)
            .setSingleChoiceItems(options,Arrays.asList(options).indexOf(current),(dialog,which)->{
                dialog.dismiss();callback.selected(options[which]);
            }).setNegativeButton("Batal",null).show();
    }
    private void showAbout(){
        new AlertDialog.Builder(this).setTitle("LaviDeck 2.1")
            .setMessage("Smart App Organizer • aplikasi terpisah dari launcher bawaan.\n\n"+
              "• Daftar aplikasi dan kategori diproses secara lokal.\n"+
              "• Tidak ada akun, iklan, analytics, atau koneksi server.\n"+
              "• Statistik pemakaian opsional, butuh izin Akses Penggunaan.\n"+
              "• PIN/biometrik hanya mengamankan shortcut dalam LaviDeck, tidak mengunci aplikasi lewat launcher lain.\n"+
              "• Folder dan situs web tersimpan di perangkat.\n"+
              "• Backup tidak menyertakan PIN, dan tidak menyertakan data dari aplikasi lain.\n"+
              "• Pengelompokan otomatis adalah perkiraan; ubah manual bila diperlukan.")
            .setPositiveButton("Mengerti",null).show();
    }
    private void pinApp(AppStore.Entry a){
        try {
            String activity=a.activity.startsWith(".")?a.pkg+a.activity:a.activity;
            Intent intent=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                .setComponent(new ComponentName(a.pkg,activity))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            Drawable drawable=a.info.loadIcon(getPackageManager());
            Bitmap bitmap=Bitmap.createBitmap(d(96),d(96),Bitmap.Config.ARGB_8888);
            Canvas canvas=new Canvas(bitmap);
            drawable.setBounds(0,0,bitmap.getWidth(),bitmap.getHeight());
            drawable.draw(canvas);
            pinShortcut("app."+a.pkg,a.name,intent,bitmap);
        }catch(Exception e){toast("Tidak berhasil membuat pintasan aplikasi");}
    }
    private void pinWeb(AppStore.Web w){
        try{
            Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse(w.url))
                .addCategory(Intent.CATEGORY_BROWSABLE);
            Bitmap bmp=Bitmap.createBitmap(d(96),d(96),Bitmap.Config.ARGB_8888);
            Canvas canvas=new Canvas(bmp);
            canvas.drawColor(accent);
            android.graphics.Paint paint=new android.graphics.Paint(3);
            paint.setColor(Color.WHITE);paint.setTextAlign(android.graphics.Paint.Align.CENTER);
            paint.setTextSize(d(49));paint.setTypeface(Typeface.DEFAULT_BOLD);
            canvas.drawText("W",bmp.getWidth()/2f,bmp.getHeight()*.7f,paint);
            pinShortcut("web."+w.id,w.name,intent,bmp);
        }catch(Exception e){toast("Tidak bisa membuat shortcut website");}
    }
    private void pinShortcut(String id,String name,Intent intent,Bitmap iconBitmap){
        try{
            ShortcutManager sm=getSystemService(ShortcutManager.class);
            if(sm==null||!sm.isRequestPinShortcutSupported()){
                toast("Launcher ponsel tidak mendukung pintasan layar utama");return;
            }
            String shortName=name.length()>22?name.substring(0,22):name;
            ShortcutInfo shortcut=new ShortcutInfo.Builder(this,id)
                .setShortLabel(shortName)
                .setLongLabel(name)
                .setIcon(Icon.createWithBitmap(iconBitmap))
                .setIntent(intent).build();
            if(sm.requestPinShortcut(shortcut,null))toast("Konfirmasi pembuatan pintasan di launcher");
            else toast("Launcher menolak permintaan pintasan");
        }catch(Exception e){toast("Gagal menambahkan pintasan");}
    }
    private void exportBackup(){
        try{
            Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/json");
            i.putExtra(Intent.EXTRA_TITLE,"Lavi-Apps-backup-v2.json");
            startActivityForResult(i,40);
        }catch(Exception e){toast("Aplikasi penyimpanan dokumen tidak tersedia");}
    }
    private void importBackup(){
        try{
            Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            startActivityForResult(i,41);
        }catch(Exception e){toast("Pemilih berkas tidak tersedia");}
    }
    @Override protected void onActivityResult(int request,int result,Intent intent){
        super.onActivityResult(request,result,intent);
        if(result!=RESULT_OK||intent==null||intent.getData()==null)return;
        Uri uri=intent.getData();
        if(request==40){
            try(OutputStream output=getContentResolver().openOutputStream(uri)){
                if(output==null)throw new Exception("Output stream kosong");
                output.write(data.exportSettings().toString(2).getBytes(StandardCharsets.UTF_8));
                output.flush();
                toast("Backup berhasil disimpan (tanpa PIN)");
            }catch(Exception e){
                new AlertDialog.Builder(this).setTitle("Ekspor gagal")
                    .setMessage(e.getMessage()).setPositiveButton("OK",null).show();
            }
        }else if(request==41){
            try(InputStream input=getContentResolver().openInputStream(uri)){
                if(input==null)throw new Exception("File tidak bisa dibaca");
                ByteArrayOutputStream buf=new ByteArrayOutputStream();
                byte[] tmp=new byte[8192];int n;
                while((n=input.read(tmp))!=-1){
                    if(buf.size()+n>512000)throw new Exception("File backup terlalu besar");
                    buf.write(tmp,0,n);
                }
                final String content=new String(buf.toByteArray(),StandardCharsets.UTF_8);
                new AlertDialog.Builder(this).setTitle("Pulihkan pengaturan?")
                    .setMessage("Kategori, favorit, folder, shortcut web, dan pengaturan tampilan akan diganti. PIN keamanan yang tersimpan tetap dipertahankan. Lanjutkan?")
                    .setNegativeButton("Batal",null)
                    .setPositiveButton("Pulihkan",(dlg,which)->{
                        try{
                            data.importSettings(content);
                            tab="Beranda";category="Semua";folderId="";search="";
                            reload();createUI();
                            toast("Backup berhasil dipulihkan");
                        }catch(Exception e){
                            new AlertDialog.Builder(this).setTitle("Impor gagal")
                                .setMessage(e.getMessage()).setPositiveButton("OK",null).show();
                        }
                    }).show();
            }catch(Exception e){
                new AlertDialog.Builder(this).setTitle("Baca file gagal")
                    .setMessage(e.getMessage()).setPositiveButton("OK",null).show();
            }
        }
    }
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
}
