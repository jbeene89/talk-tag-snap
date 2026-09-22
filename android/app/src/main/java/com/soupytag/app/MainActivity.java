package com.soupytag.app;

import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SoupyReviewPlugin.class);
        registerPlugin(SoupyExportPlugin.class);
        super.onCreate(savedInstanceState);
        int background = Color.rgb(10, 10, 10);
        getWindow().getDecorView().setBackgroundColor(background);
        getBridge().getWebView().setBackgroundColor(background);
        if (getBridge().getWebView().getParent() instanceof View) {
            ((View) getBridge().getWebView().getParent()).setBackgroundColor(background);
        }
        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
    }
}
