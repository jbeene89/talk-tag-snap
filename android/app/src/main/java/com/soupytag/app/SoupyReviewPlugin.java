package com.soupytag.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

@CapacitorPlugin(name = "SoupyReview")
public class SoupyReviewPlugin extends Plugin {
    @PluginMethod
    public void requestReview(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        Task<ReviewInfo> request = manager.requestReviewFlow();

        request.addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                call.reject("In-app review is unavailable", task.getException());
                return;
            }

            manager.launchReviewFlow(getActivity(), task.getResult())
                .addOnCompleteListener(ignored -> {
                    JSObject result = new JSObject();
                    result.put("launched", true);
                    call.resolve(result);
                });
        });
    }
}
