package com.soupytag.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SoupyReviewPlugin.class);
        registerPlugin(SoupyExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
