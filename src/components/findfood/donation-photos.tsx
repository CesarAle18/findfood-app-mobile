/**
 * The products' photos of a donation: a row of thumbnails, each opening full screen.
 * `foto_url` is a short-lived signed URL, so the cache is keyed by the item id instead.
 */
import { Image } from "expo-image";
import { useState } from "react";
import { Modal, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/design/tokens";
import type { DonacionItemDto } from "@/services/donaciones";

import { Pressing } from "./motion";
import { Card, Copy, Section } from "./ui";

interface Photo {
  id: string;
  name: string;
  uri: string;
}

/** The items that carry a photo, named by their description or, without one, their type. */
export function photosOf(items: readonly DonacionItemDto[]): Photo[] {
  return items.flatMap((item) =>
    item.foto_url
      ? [{ id: item.id, name: item.descripcion?.trim() || item.tipo_alimento.nombre, uri: item.foto_url }]
      : [],
  );
}

const source = (photo: Photo) => ({ uri: photo.uri, cacheKey: `donacion-item-${photo.id}` });

/** Nothing when no product has a photo. */
export function DonationPhotos({ items }: { items: readonly DonacionItemDto[] }) {
  const [open, setOpen] = useState<Photo | null>(null);
  const photos = photosOf(items);
  if (photos.length === 0) return null;

  return (
    <Section title="Fotografías">
      <Card>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {photos.map((photo) => (
            <Pressing
              key={photo.id}
              accessibilityRole="button"
              accessibilityLabel={`Ver foto de ${photo.name}`}
              onPress={() => setOpen(photo)}
              surface={styles.thumbnailFrame}
            >
              <Image
                source={source(photo)}
                contentFit="cover"
                recyclingKey={photo.id}
                style={styles.thumbnail}
              />
              <Copy tone="secondary" style={styles.caption}>
                {photo.name}
              </Copy>
            </Pressing>
          ))}
        </ScrollView>
      </Card>
      <Modal
        visible={open !== null}
        animationType="fade"
        onRequestClose={() => setOpen(null)}
        statusBarTranslucent
      >
        <SafeAreaView style={styles.viewer}>
          {open ? (
            <>
              <Image
                source={source(open)}
                contentFit="contain"
                style={styles.full}
                accessibilityLabel={`Foto de ${open.name}`}
              />
              <Copy weight="semibold" style={styles.viewerCaption}>
                {open.name}
              </Copy>
            </>
          ) : null}
          <Pressing
            accessibilityRole="button"
            accessibilityLabel="Cerrar foto"
            onPress={() => setOpen(null)}
            scale={1}
            surface={styles.close}
          >
            <Copy weight="semibold" style={styles.viewerCaption}>
              Cerrar
            </Copy>
          </Pressing>
        </SafeAreaView>
      </Modal>
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12 },
  thumbnailFrame: { width: 104, gap: 6 },
  thumbnail: { width: 104, height: 104, borderRadius: 10, backgroundColor: colors.muted },
  caption: { fontSize: 12 },
  viewer: { flex: 1, backgroundColor: "#000", padding: 16, gap: 12 },
  full: { flex: 1, width: "100%" },
  viewerCaption: { color: "#fff", textAlign: "center" },
  close: { minHeight: 48, justifyContent: "center", alignItems: "center" },
});
