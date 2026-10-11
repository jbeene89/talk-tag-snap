import java.io.FileInputStream;
import java.security.Key;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.Certificate;
import java.util.Arrays;
import java.util.Locale;

public final class SigningKeyVerifier {
    private static final String EXPECTED_UPLOAD_CERT_SHA256 =
        "1F005203B034F4DB5342960F5BF73525122F8DB8F3AFBB4B3647D1C52937FC3C";

    private SigningKeyVerifier() {}

    public static void main(String[] args) {
        int status = verify(args);
        if (status != 0) System.exit(status);
    }

    private static int verify(String[] args) {
        if (args.length != 1) {
            return fail("store_unlock");
        }

        char[] storePassword = environmentPassword("SOUPYTAG_STORE_PASSWORD");
        char[] keyPassword = environmentPassword("SOUPYTAG_KEY_PASSWORD");
        KeyStore store = null;
        String failureCategory = "store_unlock";
        try {
            if (storePassword == null) {
                return fail("store_unlock");
            }
            store = loadStore(args[0], storePassword);
            if (store == null) {
                return fail("store_unlock");
            }
            System.out.println("store_unlock=success");

            failureCategory = "alias_access";
            String alias = System.getenv("SOUPYTAG_KEY_ALIAS");
            if (alias == null || alias.isEmpty() ||
                !store.containsAlias(alias) || !store.isKeyEntry(alias) ||
                store.getCertificate(alias) == null) {
                return fail("alias_access");
            }
            System.out.println("alias_access=success");

            failureCategory = "private_key_access";
            if (keyPassword == null) {
                return fail("private_key_access");
            }
            Key key;
            try {
                key = store.getKey(alias, keyPassword);
            } catch (Exception ignored) {
                return fail("private_key_access");
            }
            Certificate certificate = store.getCertificate(alias);
            if (!(key instanceof PrivateKey) || certificate == null ||
                !matchesCertificateKey((PrivateKey) key, certificate)) {
                return fail("private_key_access");
            }
            System.out.println("private_key_access=success");

            failureCategory = "certificate_match";
            String fingerprint = sha256(certificate.getEncoded());
            if (!fingerprint.equals(EXPECTED_UPLOAD_CERT_SHA256))
                return fail("certificate_match");
            System.out.println("certificate_match=success");
            System.out.println("certificate_sha256=" + fingerprint);
            return 0;
        } catch (Exception ignored) {
            return fail(failureCategory);
        } finally {
            if (storePassword != null) Arrays.fill(storePassword, '\0');
            if (keyPassword != null) Arrays.fill(keyPassword, '\0');
        }
    }

    private static char[] environmentPassword(String name) {
        String value = System.getenv(name);
        return value == null ? null : value.toCharArray();
    }

    private static KeyStore loadStore(String path, char[] password) {
        for (String type : new String[] { "JKS", "PKCS12" }) {
            try (FileInputStream input = new FileInputStream(path)) {
                KeyStore store = KeyStore.getInstance(type);
                store.load(input, password);
                return store;
            } catch (Exception ignored) {
            }
        }
        return null;
    }

    private static boolean matchesCertificateKey(PrivateKey privateKey, Certificate certificate) {
        try {
            String algorithm;
            switch (privateKey.getAlgorithm().toUpperCase(Locale.ROOT)) {
                case "RSA":
                    algorithm = "SHA256withRSA";
                    break;
                case "EC":
                case "ECDSA":
                    algorithm = "SHA256withECDSA";
                    break;
                case "DSA":
                    algorithm = "SHA256withDSA";
                    break;
                case "ED25519":
                    algorithm = "Ed25519";
                    break;
                default:
                    return false;
            }
            byte[] challenge = new byte[32];
            new SecureRandom().nextBytes(challenge);
            byte[] signed = null;
            try {
                Signature signer = Signature.getInstance(algorithm);
                signer.initSign(privateKey);
                signer.update(challenge);
                signed = signer.sign();

                Signature verifier = Signature.getInstance(algorithm);
                verifier.initVerify(certificate.getPublicKey());
                verifier.update(challenge);
                return verifier.verify(signed);
            } finally {
                Arrays.fill(challenge, (byte) 0);
                if (signed != null) Arrays.fill(signed, (byte) 0);
            }
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String sha256(byte[] value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
        StringBuilder hex = new StringBuilder(digest.length * 2);
        for (byte item : digest) hex.append(String.format("%02X", item));
        Arrays.fill(digest, (byte) 0);
        Arrays.fill(value, (byte) 0);
        return hex.toString();
    }

    private static int fail(String category) {
        System.out.println(category + "=failed");
        return 1;
    }
}
