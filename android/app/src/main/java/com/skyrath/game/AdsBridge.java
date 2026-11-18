package com.skyrath.game;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

/**
 * Optional rewarded ads (AdMob) for the game, called from JavaScript as window.SkyrathAds:
 * available() -> true once ads can be requested, show() -> plays one ad, then window.skyrathAdDone(true|false)
 * (true only when the player watched it to the end). privacy() opens Google's consent / privacy options form.
 * Google's consent form (UMP) is shown first where the law requires it (for example in Europe).
 */
final class AdsBridge {
    private static final String TAG = "SkyrathAds";
    private final Activity activity;
    private final WebView web;
    private final String unitId;
    private final Handler main = new Handler(Looper.getMainLooper());
    private ConsentInformation consent;
    private volatile boolean ready = false;
    private boolean started = false, loading = false, showing = false;
    private RewardedAd ad;

    AdsBridge(Activity activity, WebView web, String unitId) {
        this.activity = activity;
        this.web = web;
        this.unitId = unitId == null ? "" : unitId.trim();
    }

    /** Ask for consent where needed, then start the ads SDK and preload one ad. */
    void start() {
        if (unitId.isEmpty()) return;
        consent = UserMessagingPlatform.getConsentInformation(activity);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consent.requestConsentInfoUpdate(activity, params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, err -> {
                    if (err != null) Log.w(TAG, "consent form: " + err.getMessage());
                    if (consent.canRequestAds()) initAds();
                }),
                err -> { Log.w(TAG, "consent info: " + err.getMessage()); if (consent.canRequestAds()) initAds(); });
        if (consent.canRequestAds()) initAds();      // consent from an earlier session
    }

    private void initAds() {
        if (started) return;
        started = true;
        new Thread(() -> MobileAds.initialize(activity, status -> main.post(() -> { ready = true; load(); }))).start();
    }

    private void load() {
        if (loading || ad != null || !ready) return;
        loading = true;
        RewardedAd.load(activity, unitId, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(RewardedAd r) { ad = r; loading = false; }
            @Override public void onAdFailedToLoad(LoadAdError e) {
                ad = null; loading = false;
                Log.i(TAG, "no ad: " + e.getMessage());
                main.postDelayed(AdsBridge.this::load, 30000);     // try again later
            }
        });
    }

    // ---------------------------------------------------------------- called from JavaScript
    @JavascriptInterface
    public boolean available() { return ready; }

    @JavascriptInterface
    public void show() {
        main.post(() -> {
            if (showing) return;
            if (ad == null) { done(false); load(); return; }
            showing = true;
            final boolean[] earned = { false };
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdDismissedFullScreenContent() { ad = null; showing = false; done(earned[0]); load(); }
                @Override public void onAdFailedToShowFullScreenContent(AdError e) { ad = null; showing = false; done(false); load(); }
            });
            ad.show(activity, item -> earned[0] = true);
        });
    }

    /** true when the player must be able to reopen the consent form (shown as a Settings button in the game). */
    @JavascriptInterface
    public boolean privacyRequired() {
        return consent != null && consent.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    @JavascriptInterface
    public void privacy() {
        main.post(() -> UserMessagingPlatform.showPrivacyOptionsForm(activity, err -> {
            if (err != null) Log.w(TAG, "privacy form: " + err.getMessage());
            if (consent != null && consent.canRequestAds()) initAds();
        }));
    }

    private void done(boolean ok) {
        main.post(() -> web.evaluateJavascript("window.skyrathAdDone && window.skyrathAdDone(" + ok + ")", null));
    }
}
