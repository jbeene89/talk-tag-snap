package com.soupytag.app;

final class DocumentRequestGate {
    private String activeMethod;
    private String activeRequestId;

    synchronized boolean begin(String method, String requestId) {
        if (method == null || requestId == null || activeMethod != null) return false;
        activeMethod = method;
        activeRequestId = requestId;
        return true;
    }

    synchronized boolean correlate(String method, String requestId) {
        if (method == null || requestId == null) return false;
        if (activeMethod == null) {
            activeMethod = method;
            activeRequestId = requestId;
            return true;
        }
        return matches(method, requestId);
    }

    synchronized boolean finish(String method, String requestId) {
        if (!matches(method, requestId)) return false;
        clear();
        return true;
    }

    private boolean matches(String method, String requestId) {
        return method != null && requestId != null &&
            method.equals(activeMethod) && requestId.equals(activeRequestId);
    }

    private void clear() {
        activeMethod = null;
        activeRequestId = null;
    }
}
