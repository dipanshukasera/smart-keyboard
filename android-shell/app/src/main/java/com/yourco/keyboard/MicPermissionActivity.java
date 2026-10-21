package com.yourco.keyboard;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Bundle;

/**
 * Invisible activity that shows Android's microphone permission prompt for
 * voice typing - a keyboard is a service, and only an activity can ask.
 * Reports the answer to VoiceInputModule and closes.
 */
public class MicPermissionActivity extends Activity {

    private static final int REQUEST_MIC = 1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) return;
        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        VoiceInputModule.onPermissionResult(granted);
        finish();
    }
}
