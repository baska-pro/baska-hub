package com.lavi.apphub;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.SystemClock;
import android.text.InputType;
import android.view.Gravity;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.SecureRandom;
import java.util.Locale;

final class SecureGate {
    private final Activity activity;
    private final SharedPreferences prefs;
    private int failures=0;
    private long lockoutUntil=0;
    SecureGate(Activity a,SharedPreferences p){activity=a;prefs=p;}
    boolean configured(){return !prefs.getString("pin_hash","").isEmpty();}
    private String hash(String pin,String salt){
        try{
            PBEKeySpec key=new PBEKeySpec(pin.toCharArray(),
                salt.getBytes(StandardCharsets.UTF_8),60000,256);
            byte[] data=SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(key).getEncoded();
            key.clearPassword();
            StringBuilder hex=new StringBuilder();
            for(byte b:data)hex.append(String.format(Locale.ROOT,"%02x",b&0xff));
            return hex.toString();
        }catch(Exception e){return "";}
    }
    private void save(String pin) {
        byte[] bytes=new byte[24];new SecureRandom().nextBytes(bytes);
        StringBuilder salt=new StringBuilder();
        for(byte b:bytes)salt.append(String.format(Locale.ROOT,"%02x",b&0xff));
        prefs.edit().putString("pin_salt",salt.toString())
                .putString("pin_hash",hash(pin,salt.toString())).apply();
        failures=0;lockoutUntil=0;
    }
    private EditText field(String hint){
        EditText v=new EditText(activity);
        v.setSingleLine(true);
        v.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        v.setHint(hint);
        v.setTextSize(17);
        return v;
    }
    void setup(Runnable onSuccess){
        if(configured()) {
            authenticate(()->setNewPin(onSuccess));
        } else setNewPin(onSuccess);
    }
    private void setNewPin(Runnable done) {
        LinearLayout layout=new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(35,14,35,0);
        EditText first=field("PIN baru (4–8 angka)");
        EditText second=field("Ulangi PIN");
        layout.addView(first);layout.addView(second);
        AlertDialog dialog=new AlertDialog.Builder(activity)
            .setTitle("Atur PIN LaviDeck")
            .setMessage("PIN hanya melindungi akses melalui LaviDeck. Aplikasi asli tetap bisa dibuka dari luar.")
            .setView(layout)
            .setPositiveButton("Simpan",null)
            .setNegativeButton("Batal",null).create();
        dialog.setOnShowListener(v->dialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener(view->{
            String pin=first.getText().toString(),repeat=second.getText().toString();
            if(!pin.matches("[0-9]{4,8}")){
                first.setError("Gunakan 4–8 angka");return;
            }
            if(!pin.equals(repeat)){
                second.setError("PIN tidak cocok");return;
            }
            save(pin);dialog.dismiss();
            Toast.makeText(activity,"PIN berhasil disimpan",Toast.LENGTH_SHORT).show();
            if(done!=null)done.run();
        }));
        dialog.show();
    }
    void authenticate(Runnable onSuccess){
        if(!configured()){
            new AlertDialog.Builder(activity).setTitle("PIN belum diatur")
                .setMessage("Buat PIN untuk melindungi shortcut ini.")
                .setPositiveButton("Buat PIN",(d,w)->setNewPin(onSuccess))
                .setNegativeButton("Batal",null).show();
            return;
        }
        if(SystemClock.elapsedRealtime()<lockoutUntil){
            Toast.makeText(activity,"Terlalu banyak percobaan. Coba kembali dalam 30 detik.",Toast.LENGTH_LONG).show();return;
        }
        if(prefs.getBoolean("biometric",false) && Build.VERSION.SDK_INT>=28) {
            try {
                android.hardware.biometrics.BiometricPrompt prompt=
                    new android.hardware.biometrics.BiometricPrompt.Builder(activity)
                        .setTitle("Buka shortcut aman")
                        .setSubtitle("Verifikasi biometrik atau gunakan PIN")
                        .setNegativeButton("Gunakan PIN",activity.getMainExecutor(),
                            (d,w)->askPin(onSuccess))
                        .build();
                prompt.authenticate(new android.os.CancellationSignal(),activity.getMainExecutor(),
                    new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback(){
                        @Override public void onAuthenticationSucceeded(
                            android.hardware.biometrics.BiometricPrompt.AuthenticationResult result){
                            failures=0;onSuccess.run();
                        }
                        @Override public void onAuthenticationError(int error,CharSequence message){
                            if(error!=13 /* BIOMETRIC_ERROR_NEGATIVE_BUTTON */)
                                askPin(onSuccess);
                        }
                    });
                return;
            }catch(Exception ignored){}
        }
        askPin(onSuccess);
    }
    private void askPin(Runnable action){
        EditText input=field("Masukkan PIN");
        LinearLayout box=new LinearLayout(activity);
        box.setPadding(32,8,32,0);
        box.addView(input,new LinearLayout.LayoutParams(-1,-2));
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("PIN keamanan")
            .setView(box).setPositiveButton("Buka",null)
            .setNegativeButton("Batal",null).create();
        dialog.setOnShowListener(v->dialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener(view->{
            if(SystemClock.elapsedRealtime()<lockoutUntil){dialog.dismiss();return;}
            String provided=hash(input.getText().toString(),prefs.getString("pin_salt",""));
            String expected=prefs.getString("pin_hash","");
            if(expected.equals(provided)&&!expected.isEmpty()){
                failures=0;dialog.dismiss();action.run();
            }else {
                failures++;
                if(failures>=5){
                    lockoutUntil=SystemClock.elapsedRealtime()+30000;
                    failures=0;dialog.dismiss();
                    Toast.makeText(activity,"PIN salah 5 kali. Terkunci 30 detik.",Toast.LENGTH_LONG).show();
                } else{
                    input.setText("");input.setError("PIN salah ("+failures+"/5)");
                }
            }
        }));
        dialog.show();
    }
}
