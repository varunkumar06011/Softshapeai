package ai.softshape.cashier;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalPosDatabase")
public class LocalPosDatabasePlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private SQLiteOpenHelper helper;
    private SQLiteDatabase database;
    private String databaseName;

    @PluginMethod
    public void open(PluginCall call) {
        final String name = call.getString("name", "softshape-local-pos");
        final int version = call.getInt("version", 1);

        executor.execute(() -> {
            try {
                synchronized (this) {
                    if (database != null && database.isOpen() && name.equals(databaseName)) {
                        resolve(call, "opened", true);
                        return;
                    }
                    closeDatabase();
                    helper = new LocalDatabaseHelper(getContext(), name, version);
                    database = helper.getWritableDatabase();
                    databaseName = name;
                }
                resolve(call, "opened", true);
            } catch (Exception error) {
                call.reject("Could not open local POS database: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        executor.execute(() -> {
            try {
                synchronized (this) {
                    closeDatabase();
                }
                resolve(call, "closed", true);
            } catch (Exception error) {
                call.reject("Could not close local POS database: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void execScript(PluginCall call) {
        final String sql = call.getString("sql", "");
        executor.execute(() -> {
            try {
                synchronized (this) {
                    requireDatabase();
                    database.beginTransaction();
                    for (String statement : splitStatements(sql)) {
                        if (statement.trim().isEmpty()) continue;
                        try {
                            database.execSQL(statement.trim());
                        } catch (Exception error) {
                            if (!isIgnorableSchemaError(error)) throw error;
                        }
                    }
                    database.setTransactionSuccessful();
                    database.endTransaction();
                }
                resolve(call, "executed", true);
            } catch (Exception error) {
                endTransactionQuietly();
                call.reject("Could not apply local POS schema: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void execute(PluginCall call) {
        final String sql = call.getString("sql", "");
        final JSONArray values = call.getArray("values", new JSArray());
        executor.execute(() -> {
            try {
                synchronized (this) {
                    requireDatabase();
                    database.execSQL(sql, toBindArgs(values));
                }
                resolve(call, "executed", true);
            } catch (Exception error) {
                call.reject("Local POS SQL execution failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void query(PluginCall call) {
        final String sql = call.getString("sql", "");
        final JSONArray values = call.getArray("values", new JSArray());
        executor.execute(() -> {
            Cursor cursor = null;
            try {
                JSArray rows = new JSArray();
                synchronized (this) {
                    requireDatabase();
                    cursor = database.rawQuery(sql, toSelectionArgs(values));
                    while (cursor.moveToNext()) {
                        JSObject row = new JSObject();
                        for (int i = 0; i < cursor.getColumnCount(); i++) {
                            putCursorValue(row, cursor.getColumnName(i), cursor, i);
                        }
                        rows.put(row);
                    }
                }
                JSObject result = new JSObject();
                result.put("rows", rows);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Local POS SQL query failed: " + error.getMessage());
            } finally {
                if (cursor != null) cursor.close();
            }
        });
    }

    @PluginMethod
    public void transaction(PluginCall call) {
        final JSONArray statements = call.getArray("statements", new JSArray());
        executor.execute(() -> {
            try {
                synchronized (this) {
                    requireDatabase();
                    database.beginTransaction();
                    for (int i = 0; i < statements.length(); i++) {
                        JSONObject statement = statements.getJSONObject(i);
                        database.execSQL(
                            statement.getString("sql"),
                            toBindArgs(statement.optJSONArray("values"))
                        );
                    }
                    database.setTransactionSuccessful();
                    database.endTransaction();
                }
                resolve(call, "committed", true);
            } catch (Exception error) {
                endTransactionQuietly();
                call.reject("Local POS transaction failed: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void health(PluginCall call) {
        JSObject result = new JSObject();
        synchronized (this) {
            result.put("opened", database != null && database.isOpen());
            result.put("name", databaseName == null ? "" : databaseName);
        }
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        synchronized (this) {
            closeDatabase();
        }
        super.handleOnDestroy();
    }

    private void requireDatabase() {
        if (database == null || !database.isOpen()) {
            throw new IllegalStateException("Local POS database is not open");
        }
    }

    private void closeDatabase() {
        if (database != null && database.isOpen()) database.close();
        if (helper != null) helper.close();
        database = null;
        helper = null;
        databaseName = null;
    }

    private void endTransactionQuietly() {
        synchronized (this) {
            if (database != null && database.inTransaction()) {
                try { database.endTransaction(); } catch (Exception ignored) { }
            }
        }
    }

    private void resolve(PluginCall call, String key, boolean value) {
        JSObject result = new JSObject();
        result.put(key, value);
        call.resolve(result);
    }

    private static boolean isIgnorableSchemaError(Exception error) {
        String message = error.getMessage();
        return message != null && message.toLowerCase().contains("duplicate column name");
    }

    private static String[] splitStatements(String sql) {
        return sql.replaceAll("(?m)--[^\\n]*", "").split(";");
    }

    private static Object[] toBindArgs(JSONArray values) throws JSONException {
        if (values == null) return new Object[0];
        Object[] args = new Object[values.length()];
        for (int i = 0; i < values.length(); i++) {
            Object value = values.opt(i);
            args[i] = value == JSONObject.NULL ? null : value;
        }
        return args;
    }

    private static String[] toSelectionArgs(JSONArray values) throws JSONException {
        if (values == null) return new String[0];
        String[] args = new String[values.length()];
        for (int i = 0; i < values.length(); i++) {
            Object value = values.opt(i);
            args[i] = value == JSONObject.NULL ? null : String.valueOf(value);
        }
        return args;
    }

    private static void putCursorValue(JSObject row, String name, Cursor cursor, int index) throws JSONException {
        switch (cursor.getType(index)) {
            case Cursor.FIELD_TYPE_INTEGER:
                row.put(name, cursor.getLong(index));
                break;
            case Cursor.FIELD_TYPE_FLOAT:
                row.put(name, cursor.getDouble(index));
                break;
            case Cursor.FIELD_TYPE_BLOB:
                row.put(name, cursor.getBlob(index));
                break;
            case Cursor.FIELD_TYPE_NULL:
                row.put(name, JSONObject.NULL);
                break;
            default:
                row.put(name, cursor.getString(index));
        }
    }

    private static final class LocalDatabaseHelper extends SQLiteOpenHelper {
        LocalDatabaseHelper(Context context, String name, int version) {
            super(context, name + ".db", null, version);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            // Schema is applied by the versioned SQL migration from JavaScript.
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Future migrations are applied by the Android migration runner.
        }
    }
}
