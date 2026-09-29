package me.galihh.audin;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundAudioRecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
