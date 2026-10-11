package com.soupytag.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DocumentRequestGateTest {
    @Test
    public void missingOpenCallbackCannotReleaseAnActiveSaveRequest() {
        DocumentRequestGate gate = new DocumentRequestGate();
        assertTrue(gate.begin("saveDocument", "save-request"));

        assertFalse(gate.finishUncorrelatedCallback("openDocument"));
        assertFalse(gate.begin("openDocument", "next-open"));
        assertFalse(gate.finish("saveDocument", "wrong-request"));
        assertTrue(gate.finish("saveDocument", "save-request"));
        assertTrue(gate.begin("openDocument", "next-open"));
        assertTrue(gate.correlate("openDocument", "next-open"));
    }

    @Test
    public void nullOrMissingRequestOnItsCallbackReleasesOnlyThatOperation() {
        DocumentRequestGate gate = new DocumentRequestGate();
        assertTrue(gate.begin("openDocument", "open-request"));

        assertFalse(gate.correlate("openDocument", null));
        assertTrue(gate.finishUncorrelatedCallback("openDocument"));
        assertTrue(gate.begin("saveDocument", "next-save"));
        assertTrue(gate.finish("saveDocument", "next-save"));
    }

    @Test
    public void restoredRequestCanBeCorrelatedAndMismatchedRequestCannotFinishIt() {
        DocumentRequestGate gate = new DocumentRequestGate();
        assertTrue(gate.correlate("openDocument", "restored-request"));
        assertFalse(gate.correlate("openDocument", "different-request"));
        assertFalse(gate.finish("openDocument", "different-request"));
        assertTrue(gate.finish("openDocument", "restored-request"));
    }
}
