package com.soupytag.app;

final class DocumentRequestGate {
    private String activeMethod;
    private String activeRequestId;

    synchronized boolean begin(String method, String requestId) {
        if (activeMethod != null) return false;
        activeMethod = method;
        activeRequestId = requestId;
        return true;
    }

    synchronized boolean correlate(String method, String requestId) {
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

    synchronized boolean finishUncorrelatedCallback(String method) {
        if (activeMethod == null || !activeMethod.equals(method)) return false;
        clear();
        return true;
    }

    private boolean matches(String method, String requestId) {
        return method.equals(activeMethod) && requestId != null && requestId.equals(activeRequestId);
    }

    private void clear() {
        activeMethod = null;
        activeRequestId = null;
    }
}
