package house.mouseion.iris;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * What the push service needs while the web app is not running: the Matrix session (so it can
 * fetch the pushed event), the UnifiedPush endpoint, the sound setting and per-room notification
 * history.
 *
 * Stored in the "mouseion" preferences the Compose app used (same keys for the endpoint, error and
 * sound setting). The access token is encrypted with an Android Keystore AES-GCM key, so the file
 * alone never carries a usable token; it is never logged.
 */
final class PushStore {

    static final String KEY_ENDPOINT = "push.endpoint";
    static final String KEY_ERROR = "push.error";
    static final String KEY_SOUND = "isNotificationSounds";
    private static final String KEY_BASE_URL = "session.baseUrl";
    private static final String KEY_USER_ID = "session.userId";
    private static final String KEY_TOKEN = "session.token";
    private static final String KEYSTORE_ALIAS = "mouseion.session";

    static final class Session {
        final String baseUrl;
        final String userId;
        final String accessToken;

        Session(String baseUrl, String userId, String accessToken) {
            this.baseUrl = baseUrl;
            this.userId = userId;
            this.accessToken = accessToken;
        }
    }

    private PushStore() {}

    static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences("mouseion", Context.MODE_PRIVATE);
    }

    static void saveSession(Context context, String baseUrl, String userId, String accessToken) throws Exception {
        prefs(context)
            .edit()
            .putString(KEY_BASE_URL, baseUrl)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_TOKEN, encrypt(accessToken))
            .apply();
    }

    static void clearSession(Context context) {
        prefs(context).edit().remove(KEY_BASE_URL).remove(KEY_USER_ID).remove(KEY_TOKEN).apply();
    }

    /** The stored session, or null when signed out or the token cannot be decrypted. */
    static Session session(Context context) {
        SharedPreferences p = prefs(context);
        String baseUrl = p.getString(KEY_BASE_URL, null);
        String userId = p.getString(KEY_USER_ID, null);
        String token = p.getString(KEY_TOKEN, null);
        if (baseUrl == null || userId == null || token == null) return null;
        try {
            return new Session(baseUrl, userId, decrypt(token));
        } catch (Exception e) {
            return null;
        }
    }

    static boolean soundEnabled(Context context) {
        return !"false".equals(prefs(context).getString(KEY_SOUND, null));
    }

    private static SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        KeyStore.Entry entry = keyStore.getEntry(KEYSTORE_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(
            new KeyGenParameterSpec.Builder(KEYSTORE_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        );
        return generator.generateKey();
    }

    private static String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP);
    }

    private static String decrypt(String stored) throws Exception {
        int split = stored.indexOf(':');
        byte[] iv = Base64.decode(stored.substring(0, split), Base64.NO_WRAP);
        byte[] sealed = Base64.decode(stored.substring(split + 1), Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
    }
}
