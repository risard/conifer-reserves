package org.opensrf.util;

import java.io.*;
import java.util.*;

/**
 * JSON utilities.
 */
public class JSON {

    public static final String JSON_CLASS_KEY = "__c";
    public static final String JSON_PAYLOAD_KEY = "__p";


    /**
     * @see toJSON(Object, StringBuffer)
     */
    public static String toJSON(Object obj) {
        StringBuffer sb = new StringBuffer();
        toJSON(obj, sb);
        return sb.toString();
    }


    /**
     * Encodes a java object to JSON.
     * Maps (HashMaps, etc.) are encoded as JSON objects.  
     * Iterable's (Lists, etc.) are encoded as JSON arrays
     */
    public static void toJSON(Object obj, StringBuffer sb) {

        /** JSON null */
        if(obj == null) {
            sb.append("null");
            return;
        }

        /** JSON string */
        if(obj instanceof String) {
            sb.append('"');
            Utils.escape((String) obj, sb);
            sb.append('"');
            return;
        }

        /** JSON number */
        if(obj instanceof Number) {
            sb.append(obj.toString());
            return;
        }

        /** JSON array */
        if(obj instanceof Iterable) {
            encodeJSONArray((Iterable) obj, sb);
            return;
        }

        /** JSON object */
        if(obj instanceof Map) {
            encodeJSONObject((Map) obj, sb);
            return;
        }

        /** JSON boolean */
        if(obj instanceof Boolean) {
            sb.append((((Boolean) obj).booleanValue() ? "true" : "false"));
            return;
        }
    }


    /**
     * Encodes a List as a JSON array
     */
    private static void encodeJSONArray(Iterable iterable, StringBuffer sb) {
        Iterator itr = iterable.iterator();
        sb.append("[");
        boolean some = false;

        while(itr.hasNext()) {
            some = true;
            toJSON(itr.next(), sb);
            sb.append(',');
        }

        /* remove the trailing comma if the array has any items*/
        if(some) 
            sb.deleteCharAt(sb.length()-1); 
        sb.append("]");
    }


    /**
     * Encodes a Map to a JSON object
     */
    private static void encodeJSONObject(Map map, StringBuffer sb) {
        Iterator itr = map.keySet().iterator();
        sb.append("{");
        Object key = null;

        while(itr.hasNext()) {
            key = itr.next();
            toJSON(key, sb);
            sb.append(':');
            toJSON(map.get(key), sb);
            sb.append(',');
        }

        /* remove the trailing comma if the object has any items*/
        if(key != null) 
            sb.deleteCharAt(sb.length()-1); 
        sb.append("}");
    }
}



