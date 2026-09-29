package me.galihh.audin;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.MediaMetadataRetriever;
import android.os.Build;
import android.util.Base64;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

@CapacitorPlugin(
    name = "BackgroundAudioRecorder",
    permissions = {
        @Permission(
            alias = "audio",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class BackgroundAudioRecorderPlugin extends Plugin {
    private static final String TAG = "AudinRecorderPlugin";
    private String currentFilePath = null;
    private long startTimeMs = 0;
    private long pausedDurationMs = 0;
    private long lastPauseTimeMs = 0;
    private boolean isRecording = false;
    private boolean isPaused = false;

    @PluginMethod
    public void canRecord(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        boolean hasRecord = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        JSObject ret = new JSObject();
        ret.put("value", hasRecord);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("audio", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        JSObject ret = new JSObject();
        ret.put("value", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void startRecording(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Microphone permission not granted");
            return;
        }

        try {
            File cacheDir = getContext().getCacheDir();
            File audioFile = new File(cacheDir, "rec_" + System.currentTimeMillis() + ".m4a");
            currentFilePath = audioFile.getAbsolutePath();
            startTimeMs = System.currentTimeMillis();
            pausedDurationMs = 0;
            lastPauseTimeMs = 0;

            Context context = getContext();
            Intent intent = new Intent(context, RecordingService.class);
            intent.setAction(RecordingService.ACTION_START);
            intent.putExtra(RecordingService.EXTRA_FILE_PATH, currentFilePath);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }

            isRecording = true;
            isPaused = false;

            JSObject ret = new JSObject();
            ret.put("value", true);
            ret.put("filePath", currentFilePath);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start recording service", e);
            call.reject("Failed to start recording: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pauseRecording(PluginCall call) {
        if (!isRecording || isPaused) {
            call.reject("Not recording or already paused");
            return;
        }

        try {
            Context context = getContext();
            Intent intent = new Intent(context, RecordingService.class);
            intent.setAction(RecordingService.ACTION_PAUSE);
            context.startService(intent);

            isPaused = true;
            lastPauseTimeMs = System.currentTimeMillis();

            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to pause: " + e.getMessage());
        }
    }

    @PluginMethod
    public void resumeRecording(PluginCall call) {
        if (!isRecording || !isPaused) {
            call.reject("Not paused");
            return;
        }

        try {
            Context context = getContext();
            Intent intent = new Intent(context, RecordingService.class);
            intent.setAction(RecordingService.ACTION_RESUME);
            context.startService(intent);

            if (lastPauseTimeMs > 0) {
                pausedDurationMs += (System.currentTimeMillis() - lastPauseTimeMs);
                lastPauseTimeMs = 0;
            }
            isPaused = false;

            JSObject ret = new JSObject();
            ret.put("value", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to resume: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        if (!isRecording) {
            call.reject("No recording in progress");
            return;
        }

        try {
            Context context = getContext();
            Intent intent = new Intent(context, RecordingService.class);
            intent.setAction(RecordingService.ACTION_STOP);
            context.startService(intent);

            isRecording = false;
            isPaused = false;

            // Wait brief moment for MediaRecorder to flush and close file
            try {
                Thread.sleep(300);
            } catch (InterruptedException ignored) {}

            if (currentFilePath == null) {
                call.reject("Recording file path lost");
                return;
            }

            File file = new File(currentFilePath);
            if (!file.exists() || file.length() == 0) {
                call.reject("Recording file is empty or missing");
                return;
            }

            long totalDurationMs = Math.max(1000, System.currentTimeMillis() - startTimeMs - pausedDurationMs);
            try {
                MediaMetadataRetriever mmr = new MediaMetadataRetriever();
                mmr.setDataSource(currentFilePath);
                String durStr = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                if (durStr != null) {
                    totalDurationMs = Long.parseLong(durStr);
                }
                mmr.release();
            } catch (Exception ignored) {}

            byte[] bytes = readFileToByteArray(file);
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);

            JSObject ret = new JSObject();
            ret.put("value", true);
            ret.put("base64", base64);
            ret.put("mimeType", "audio/mp4");
            ret.put("durationMs", totalDurationMs);
            ret.put("fileName", file.getName());
            ret.put("sizeBytes", file.length());

            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop recording", e);
            call.reject("Failed to stop recording: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        if (!isRecording) {
            ret.put("status", "idle");
        } else if (isPaused) {
            ret.put("status", "paused");
        } else {
            ret.put("status", "recording");
        }
        ret.put("filePath", currentFilePath);
        call.resolve(ret);
    }

    private byte[] readFileToByteArray(File file) throws IOException {
        byte[] bytes = new byte[(int) file.length()];
        try (FileInputStream fis = new FileInputStream(file)) {
            int offset = 0;
            int numRead;
            while (offset < bytes.length && (numRead = fis.read(bytes, offset, bytes.length - offset)) >= 0) {
                offset += numRead;
            }
        }
        return bytes;
    }
}
