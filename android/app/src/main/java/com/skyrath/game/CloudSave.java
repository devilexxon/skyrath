package com.skyrath.game;

import android.app.Activity;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * Cloud save through Google Play Games (Saved Games). The game calls this from JavaScript as window.SkyrathAndroid,
 * and gets answers back on window.skyrathCloud: onState(signedIn, name), onLoad(text, error), onSaved(ok).
 * The save is one small JSON text stored in the player's Google account. If Play Games is not set up for this
 * build (no project ID) everything here reports "not available" and the game keeps saving on the phone only.
 */
final class CloudSave {
    private static final String TAG = "SkyrathCloud";
    private static final String SLOT = "skyrath_save";

    private final Activity activity;
    private final WebView web;
    private final boolean enabled;
    private boolean signedIn = false;
    private String playerName = "";
    // writes are done one at a time; if the game saves again meanwhile, only the newest text is written next
    private boolean writing = false;
    private String pendingWrite = null;

    CloudSave(Activity activity, WebView web, String projectId) {
        this.activity = activity;
        this.web = web;
        boolean ok = projectId != null && projectId.trim().matches("\\d{6,}");
        if (ok) {
            try { PlayGamesSdk.initialize(activity); } catch (RuntimeException e) { Log.w(TAG, "Play Games init failed", e); ok = false; }
        }
        this.enabled = ok;
    }

    /** Checks the automatic Play Games sign-in when the game starts. */
    void start() {
        if (!enabled) { sendState(); return; }
        GamesSignInClient client = PlayGames.getGamesSignInClient(activity);
        client.isAuthenticated().addOnCompleteListener(t -> {
            signedIn = t.isSuccessful() && t.getResult() != null && t.getResult().isAuthenticated();
            afterSignIn();
        });
    }

    private void afterSignIn() {
        if (!signedIn) { sendState(); return; }
        PlayGames.getPlayersClient(activity).getCurrentPlayer().addOnCompleteListener(t -> {
            playerName = t.isSuccessful() && t.getResult() != null ? t.getResult().getDisplayName() : "";
            sendState();
        });
    }

    // ---------------------------------------------------------------- called from JavaScript (on a background thread)
    @JavascriptInterface
    public boolean available() { return enabled; }

    @JavascriptInterface
    public void signIn() {
        if (!enabled) { sendState(); return; }
        activity.runOnUiThread(() -> PlayGames.getGamesSignInClient(activity).signIn().addOnCompleteListener(t -> {
            signedIn = t.isSuccessful() && t.getResult() != null && t.getResult().isAuthenticated();
            afterSignIn();
        }));
    }

    @JavascriptInterface
    public void requestState() { activity.runOnUiThread(this::sendState); }

    @JavascriptInterface
    public void load() {
        if (!enabled || !signedIn) { sendLoad(null, "not signed in"); return; }
        activity.runOnUiThread(() -> {
            SnapshotsClient snaps = PlayGames.getSnapshotsClient(activity);
            snaps.open(SLOT, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED).addOnCompleteListener(t -> {
                if (!t.isSuccessful() || t.getResult() == null || t.getResult().isConflict()) {
                    sendLoad(null, "open failed"); return;
                }
                Snapshot snap = t.getResult().getData();
                String text = null;
                try {
                    byte[] bytes = snap.getSnapshotContents().readFully();
                    if (bytes != null && bytes.length > 0) text = new String(bytes, StandardCharsets.UTF_8);
                } catch (Exception e) { Log.w(TAG, "read failed", e); }
                snaps.discardAndClose(snap);
                sendLoad(text, null);
            });
        });
    }

    @JavascriptInterface
    public void save(String text) {
        if (!enabled || !signedIn || text == null) return;
        activity.runOnUiThread(() -> {
            pendingWrite = text;
            if (!writing) writeNext();
        });
    }

    private void writeNext() {
        final String text = pendingWrite;
        pendingWrite = null;
        if (text == null) { writing = false; return; }
        writing = true;
        SnapshotsClient snaps = PlayGames.getSnapshotsClient(activity);
        snaps.open(SLOT, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED).addOnCompleteListener(t -> {
            if (!t.isSuccessful() || t.getResult() == null || t.getResult().isConflict()) {
                sendSaved(false); writeNext(); return;
            }
            Snapshot snap = t.getResult().getData();
            snap.getSnapshotContents().writeBytes(text.getBytes(StandardCharsets.UTF_8));
            SnapshotMetadataChange change = new SnapshotMetadataChange.Builder().setDescription("Skyrath progress").build();
            snaps.commitAndClose(snap, change).addOnCompleteListener(c -> { sendSaved(c.isSuccessful()); writeNext(); });
        });
    }

    // ---------------------------------------------------------------- answers back to the game
    private void js(String code) {
        activity.runOnUiThread(() -> web.evaluateJavascript("window.skyrathCloud && " + code, null));
    }

    private void sendState() {
        js("window.skyrathCloud.onState(" + enabled + "," + signedIn + "," + JSONObject.quote(playerName == null ? "" : playerName) + ")");
    }

    private void sendLoad(String text, String error) {
        js("window.skyrathCloud.onLoad(" + (text == null ? "null" : JSONObject.quote(text)) + "," + (error == null ? "null" : JSONObject.quote(error)) + ")");
    }

    private void sendSaved(boolean ok) { js("window.skyrathCloud.onSaved(" + ok + ")"); }
}
