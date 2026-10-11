package com.soupytag.app;

import android.util.Base64;
import android.util.Base64InputStream;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;
import java.util.Locale;

final class DocumentPayload {
    static final long MAX_TRAIL_BYTES = 12L * 1024 * 1024 + 256 * 1024;
    static final long MAX_PDF_BYTES = 64L * 1024 * 1024;
    private static final int METADATA_VERSION = 1;
    private static final String TOKEN_PATTERN = "[0-9a-fA-F-]{36}";

    static final class Staged {
        final String token;
        final String mimeType;
        final long length;
        final byte[] digest;
        final File dataFile;
        final File metadataFile;

        Staged(String token, String mimeType, long length, byte[] digest, File dataFile, File metadataFile) {
            this.token = token;
            this.mimeType = mimeType;
            this.length = length;
            this.digest = digest;
            this.dataFile = dataFile;
            this.metadataFile = metadataFile;
        }
    }

    static final class StagingException extends IOException {
        final long bytes;

        StagingException(long bytes, IOException cause) {
            super(cause.getMessage(), cause);
            this.bytes = bytes;
        }
    }

    private DocumentPayload() {}

    static String validateFileName(String fileName, String mimeType) throws IOException {
        if (fileName == null || fileName.isEmpty() || fileName.length() > 128)
            throw new IOException("Choose a valid document filename.");
        String expectedExtension;
        switch (mimeType == null ? "" : mimeType) {
            case "application/pdf":
                expectedExtension = ".pdf";
                break;
            case "application/json":
                expectedExtension = ".json";
                break;
            case "text/html":
                expectedExtension = ".html";
                break;
            default:
                throw new IOException("Unsupported document type.");
        }
        String safeName = fileName.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (safeName.equals(".") || safeName.equals("..") ||
            !safeName.toLowerCase(Locale.ROOT).endsWith(expectedExtension))
            throw new IOException("The filename extension does not match the document type.");
        return safeName;
    }

    static Staged stage(File directory, String base64, String fileName, String mimeType) throws IOException {
        validateFileName(fileName, mimeType);
        long maxBytes = "application/pdf".equals(mimeType) ? MAX_PDF_BYTES : MAX_TRAIL_BYTES;
        validateBase64(base64, maxBytes);
        if (!directory.exists() && !directory.mkdirs())
            throw new IOException("Private document staging is unavailable.");
        if (!directory.isDirectory()) throw new IOException("Private document staging is unavailable.");

        String token = UUID.randomUUID().toString();
        File dataFile = new File(directory, token + ".data");
        File metadataFile = new File(directory, token + ".meta");
        long length = 0;
        MessageDigest digest = sha256();
        try (InputStream decoded = new Base64InputStream(new StringAsciiInputStream(base64), Base64.DEFAULT);
             OutputStream output = new BufferedOutputStream(new FileOutputStream(dataFile))) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = decoded.read(buffer)) != -1) {
                length += count;
                if (length > maxBytes) throw new IOException("The document exceeds the supported size limit.");
                digest.update(buffer, 0, count);
                output.write(buffer, 0, count);
            }
        } catch (IOException error) {
            dataFile.delete();
            throw new StagingException(length, error);
        } catch (RuntimeException error) {
            dataFile.delete();
            throw error;
        }
        if (length == 0) {
            dataFile.delete();
            throw new IOException("The document is empty.");
        }

        Staged staged = new Staged(token, mimeType, length, digest.digest(), dataFile, metadataFile);
        try {
            validateContent(staged);
            writeMetadata(staged);
            return staged;
        } catch (IOException error) {
            cleanup(staged);
            throw new StagingException(length, error);
        }
    }

    static Staged restore(File directory, String token) throws IOException {
        if (token == null || !token.matches(TOKEN_PATTERN))
            throw new IOException("The staged document request is invalid.");
        File dataFile = new File(directory, token + ".data");
        File metadataFile = new File(directory, token + ".meta");
        if (!dataFile.isFile() || !metadataFile.isFile())
            throw new IOException("The staged document expired before it could be saved.");

        try (DataInputStream input = new DataInputStream(new BufferedInputStream(new FileInputStream(metadataFile)))) {
            if (input.readInt() != METADATA_VERSION) throw new IOException("The staged document metadata is invalid.");
            String mimeType = input.readUTF();
            long length = input.readLong();
            byte[] digest = new byte[32];
            input.readFully(digest);
            if (input.read() != -1 || length <= 0 || length > maxBytesFor(mimeType) ||
                dataFile.length() != length)
                throw new IOException("The staged document metadata is invalid.");
            Staged staged = new Staged(token, mimeType, length, digest, dataFile, metadataFile);
            validateContent(staged);
            return staged;
        }
    }

    static long copyTo(Staged staged, OutputStream output) throws IOException {
        long copied = 0;
        try (InputStream input = new BufferedInputStream(new FileInputStream(staged.dataFile))) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
                copied += count;
            }
        }
        if (copied != staged.length) throw new IOException("The document write was incomplete.");
        return copied;
    }

    static void verifyReadback(Staged staged, InputStream input) throws IOException {
        MessageDigest digest = sha256();
        long length = 0;
        byte[] prefix = new byte[8];
        int prefixLength = 0;
        byte[] buffer = new byte[16 * 1024];
        int count;
        try (InputStream source = new BufferedInputStream(input)) {
            while ((count = source.read(buffer)) != -1) {
                if (prefixLength < prefix.length) {
                    int take = Math.min(count, prefix.length - prefixLength);
                    System.arraycopy(buffer, 0, prefix, prefixLength, take);
                    prefixLength += take;
                }
                length += count;
                digest.update(buffer, 0, count);
            }
        }
        if (length != staged.length || !MessageDigest.isEqual(digest.digest(), staged.digest))
            throw new IOException("The selected document location did not retain the complete export.");
        validateSignature(staged.mimeType, prefix, prefixLength);
    }

    static void validateContent(Staged staged) throws IOException {
        MessageDigest digest = sha256();
        ByteArrayOutputStream prefix = new ByteArrayOutputStream(8);
        long length = 0;
        try (InputStream input = new BufferedInputStream(new FileInputStream(staged.dataFile))) {
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                int needed = 8 - prefix.size();
                if (needed > 0) prefix.write(buffer, 0, Math.min(needed, count));
                length += count;
                digest.update(buffer, 0, count);
            }
        }
        if (length != staged.length || !MessageDigest.isEqual(digest.digest(), staged.digest))
            throw new IOException("The staged document failed its integrity check.");
        byte[] initialBytes = prefix.toByteArray();
        validateSignature(staged.mimeType, initialBytes, initialBytes.length);

        if ("application/pdf".equals(staged.mimeType)) {
            validatePdfTrailer(staged.dataFile);
        } else if ("application/json".equals(staged.mimeType)) {
            String content = readUtf8(staged.dataFile, staged.length);
            try {
                JSONObject object = new JSONObject(content);
                int version = object.optInt("version", -1);
                if (version != 1 && version != 2)
                    throw new IOException("The selected JSON is not a supported Context Trail.");
            } catch (JSONException error) {
                throw new IOException("The selected JSON document is malformed.", error);
            }
        } else if ("text/html".equals(staged.mimeType)) {
            String content = readUtf8(staged.dataFile, staged.length).trim().toLowerCase(Locale.ROOT);
            if (!(content.startsWith("<!doctype html>") || content.startsWith("<html")) ||
                !content.contains("</html>"))
                throw new IOException("The selected HTML document is malformed.");
        }
    }

    static void cleanup(Staged staged) {
        if (staged == null) return;
        staged.dataFile.delete();
        staged.metadataFile.delete();
    }

    static void cleanup(File directory, String token) {
        if (token == null || !token.matches(TOKEN_PATTERN)) return;
        new File(directory, token + ".data").delete();
        new File(directory, token + ".meta").delete();
    }

    static void cleanupStale(File directory, long nowMillis) {
        File[] files = directory.listFiles();
        if (files == null) return;
        for (File file : files) {
            if (file.isFile() && nowMillis - file.lastModified() > 24L * 60 * 60 * 1000)
                file.delete();
        }
    }

    private static long maxBytesFor(String mimeType) throws IOException {
        if ("application/pdf".equals(mimeType)) return MAX_PDF_BYTES;
        if ("application/json".equals(mimeType) || "text/html".equals(mimeType)) return MAX_TRAIL_BYTES;
        throw new IOException("Unsupported document type.");
    }

    private static void validateBase64(String base64, long maxBytes) throws IOException {
        long maxEncodedLength = ((maxBytes + 2) / 3) * 4;
        if (base64 == null || base64.isEmpty() || base64.length() > maxEncodedLength ||
            base64.length() % 4 != 0)
            throw new IOException("The document is empty or exceeds the supported size limit.");
        int padding = 0;
        for (int index = 0; index < base64.length(); index++) {
            char character = base64.charAt(index);
            if (character == '=') {
                padding++;
                if (index < base64.length() - 2 || padding > 2)
                    throw new IOException("The document encoding is invalid.");
            } else if (padding > 0 ||
                !(character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z' ||
                  character >= '0' && character <= '9' || character == '+' || character == '/')) {
                throw new IOException("The document encoding is invalid.");
            }
        }
    }

    private static void validateSignature(String mimeType, byte[] prefix, int length) throws IOException {
        if ("application/pdf".equals(mimeType)) {
            if (!startsWith(prefix, length, "%PDF-"))
                throw new IOException("The PDF export does not have a valid PDF signature.");
        } else if ("application/json".equals(mimeType)) {
            if (length == 0 || prefix[0] != '{')
                throw new IOException("The JSON export does not have a valid trail signature.");
        } else if ("text/html".equals(mimeType)) {
            if (length < 6 || prefix[0] != '<')
                throw new IOException("The HTML export does not have a valid document signature.");
        } else {
            throw new IOException("Unsupported document type.");
        }
    }

    private static boolean startsWith(byte[] value, int length, String prefix) {
        if (length < prefix.length()) return false;
        for (int index = 0; index < prefix.length(); index++)
            if (value[index] != (byte) prefix.charAt(index)) return false;
        return true;
    }

    private static String readUtf8(File file, long size) throws IOException {
        if (size > Integer.MAX_VALUE) throw new IOException("The document is too large to validate.");
        byte[] bytes = new byte[(int) size];
        try (InputStream input = new FileInputStream(file)) {
            int offset = 0;
            while (offset < bytes.length) {
                int count = input.read(bytes, offset, bytes.length - offset);
                if (count < 0) throw new IOException("The staged document is incomplete.");
                offset += count;
            }

            if (input.read() != -1) throw new IOException("The staged document changed while validating.");
        }
        try {
            return StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString();
        } catch (CharacterCodingException error) {
            throw new IOException("The document is not valid UTF-8.", error);
        }
    }

    private static void validatePdfTrailer(File file) throws IOException {
        byte[] tail = new byte[(int) Math.min(file.length(), 2048)];
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            input.seek(file.length() - tail.length);
            input.readFully(tail);
        }
        if (!new String(tail, StandardCharsets.US_ASCII).contains("%%EOF"))
            throw new IOException("The PDF export is incomplete.");
    }

    private static void writeMetadata(Staged staged) throws IOException {
        try (DataOutputStream output = new DataOutputStream(new BufferedOutputStream(new FileOutputStream(staged.metadataFile)))) {
            output.writeInt(METADATA_VERSION);
            output.writeUTF(staged.mimeType);
            output.writeLong(staged.length);
            output.write(staged.digest);
        }
    }

    private static MessageDigest sha256() throws IOException {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException error) {
            throw new IOException("Document integrity checking is unavailable.", error);
        }
    }

    private static final class StringAsciiInputStream extends InputStream {
        private final String value;
        private int position;

        StringAsciiInputStream(String value) {
            this.value = value;
        }

        @Override
        public int read() {
            return position < value.length() ? value.charAt(position++) : -1;
        }
    }
}
