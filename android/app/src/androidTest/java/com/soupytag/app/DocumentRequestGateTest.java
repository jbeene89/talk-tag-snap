package com.soupytag.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class DocumentRequestGateTest {
    @Test
    public void missingOpenCallbackCannotReleaseAnActiveSaveRequest() {
        DocumentRequestGate gate = new DocumentRequestGate();
        assertTrue(gate.begin("saveDocument", "save-request"));

        assertFalse(gate.finish("openDocument", null));
        assertFalse(gate.begin("openDocument", "next-open"));
        assertFalse(gate.finish("saveDocument", "wrong-request"));
        assertTrue(gate.finish("saveDocument", "save-request"));
        assertTrue(gate.begin("openDocument", "next-open"));
        assertTrue(gate.correlate("openDocument", "next-open"));
    }

    @Test
    public void staleNullCallbackCannotReleaseANewerRequestOfTheSameMethod() {
        DocumentRequestGate gate = new DocumentRequestGate();
        assertTrue(gate.begin("openDocument", "open-a"));
        assertTrue(gate.finish("openDocument", "open-a"));
        assertTrue(gate.begin("openDocument", "open-b"));

        assertFalse(gate.correlate("openDocument", null));
        assertFalse(gate.finish("openDocument", null));
        assertFalse(gate.begin("saveDocument", "save-c"));
        assertFalse(gate.finish("openDocument", "open-a"));
        assertFalse(gate.finish("openDocument", "wrong-id"));
        assertTrue(gate.finish("openDocument", "open-b"));
        assertTrue(gate.begin("saveDocument", "save-c"));
        assertTrue(gate.finish("saveDocument", "save-c"));
    }

    @Test
    public void missingRequestCannotBecomeAnOwner() {
        DocumentRequestGate gate = new DocumentRequestGate();
        assertFalse(gate.begin("openDocument", null));
        assertFalse(gate.correlate("openDocument", null));
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
