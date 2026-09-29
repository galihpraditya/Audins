package me.galihh.audin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.io.File;

public class RecordingService extends Service {
    private static final String TAG = "AudinRecordingService";
    public static final String CHANNEL_ID = "audin_recorder_channel";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START = "me.galihh.audin.action.START";
    public static final String ACTION_PAUSE = "me.galihh.audin.action.PAUSE";
    public static final String ACTION_RESUME = "me.galihh.audin.action.RESUME";
    public static final String ACTION_STOP = "me.galihh.audin.action.STOP";
    public static final String EXTRA_FILE_PATH = "extra_file_path";

    private MediaRecorder mediaRecorder;
    private PowerManager.WakeLock wakeLock;
    private boolean isRecording = false;
    private boolean isPaused = false;
    private String currentFilePath;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        switch (action) {
            case ACTION_START:
                String path = intent.getStringExtra(EXTRA_FILE_PATH);
                startRecording(path);
                break;
            case ACTION_PAUSE:
                pauseRecording();
                break;
            case ACTION_RESUME:
                resumeRecording();
                break;
            case ACTION_STOP:
                stopRecording();
                break;
        }

        return START_NOT_STICKY;
    }

    private void startRecording(String filePath) {
        if (isRecording) {
            Log.w(TAG, "Already recording");
            return;
        }

        this.currentFilePath = filePath;

        // Acquire WakeLock to keep CPU running when screen is locked
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Audin:AudioRecorderWakeLock");
            wakeLock.acquire();
        }

        Notification notification = buildNotification("Merekam audio di latar belakang...", false);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                int serviceType = 0;
                if (Build.VERSION.SDK_INT >= 34) { // Android 14+
                    serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                }
                ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, serviceType);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start foreground service", e);
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                mediaRecorder = new MediaRecorder(this);
            } else {
                mediaRecorder = new MediaRecorder();
            }

            mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            mediaRecorder.setAudioEncodingBitRate(128000);
            mediaRecorder.setAudioSamplingRate(44100);
            mediaRecorder.setOutputFile(filePath);

            mediaRecorder.prepare();
            mediaRecorder.start();

            isRecording = true;
            isPaused = false;
            Log.i(TAG, "Recording started at: " + filePath);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start MediaRecorder", e);
            cleanup();
            stopSelf();
        }
    }

    private void pauseRecording() {
        if (isRecording && !isPaused && mediaRecorder != null) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    mediaRecorder.pause();
                    isPaused = true;
                    updateNotification("Perekaman dijeda (latar belakang)", true);
                    Log.i(TAG, "Recording paused");
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to pause recording", e);
            }
        }
    }

    private void resumeRecording() {
        if (isRecording && isPaused && mediaRecorder != null) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    mediaRecorder.resume();
                    isPaused = false;
                    updateNotification("Merekam audio di latar belakang...", false);
                    Log.i(TAG, "Recording resumed");
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to resume recording", e);
            }
        }
    }

    private void stopRecording() {
        if (isRecording && mediaRecorder != null) {
            try {
                mediaRecorder.stop();
                Log.i(TAG, "Recording stopped successfully");
            } catch (Exception e) {
                Log.e(TAG, "Error stopping MediaRecorder", e);
            }
        }
        cleanup();
        stopForeground(true);
        stopSelf();
    }

    private void cleanup() {
        if (mediaRecorder != null) {
            try {
                mediaRecorder.reset();
                mediaRecorder.release();
            } catch (Exception ignored) {}
            mediaRecorder = null;
        }

        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
            wakeLock = null;
        }

        isRecording = false;
        isPaused = false;
    }

    @Override
    public void onDestroy() {
        cleanup();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Audin Perekam Audio",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Menampilkan status perekaman audio di latar belakang");
            channel.enableLights(false);
            channel.enableVibration(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String text, boolean paused) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        int iconRes = getApplicationInfo().icon;
        if (iconRes == 0) {
            iconRes = android.R.drawable.ic_btn_speak_now;
        }

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Audin AI Voice Recorder")
            .setContentText(text)
            .setSmallIcon(iconRes)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void updateNotification(String text, boolean paused) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification(text, paused));
        }
    }
}
