public final class SigningKeyVerifierTestHarness {
    private SigningKeyVerifierTestHarness() {}

    public static void main(String[] args) {
        if (args.length != 2) System.exit(2);
        int status = SigningKeyVerifier.verifyForTest(
            new String[] { args[0] }, args[1]);
        if (status != 0) System.exit(status);
    }
}
