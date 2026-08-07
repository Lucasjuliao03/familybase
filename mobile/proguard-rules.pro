 # Prevent R8/ProGuard from stripping Kotlin reflection and lazy types
 #  -keep class kotlin.reflect.jvm.internal.impl.** { *; }
 #  -keep class kotlin.reflect.jvm.internal.impl.serialization.deserialization.descriptors.DeserializedClassDescriptor$EnumEntryLazyTypeRef { *; }
 #  -dontwarn kotlin.reflect.jvm.internal.**