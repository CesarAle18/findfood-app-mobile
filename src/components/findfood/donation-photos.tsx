/**
 * The products' photos of a donation: a horizontal 4:3 carousel whose cards carry the
 * product name and the photo count, each opening a full-screen viewer that swipes between
 * them. `foto_url` is a short-lived signed URL, so the cache is keyed by the item id instead.
 */
import { Image } from "expo-image";
import { useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/design/tokens";
import type { DonacionItemDto } from "@/services/donaciones";

import { Icon } from "./icon";
import { Pressing } from "./motion";
import { Copy, Section } from "./ui";

interface Photo {
  id: string;
  name: string;
  uri: string;
}

/** The items that carry a photo, named by their description or, without one, their type. */
export function photosOf(items: readonly DonacionItemDto[]): Photo[] {
  return items.flatMap((item) =>
    item.foto_url
      ? [
          {
            id: item.id,
            name: item.descripcion?.trim() || item.tipo_alimento.nombre,
            uri: item.foto_url,
          },
        ]
      : [],
  );
}

const source = (photo: Photo) => ({
  uri: photo.uri,
  cacheKey: `donacion-item-${photo.id}`,
});

/** Side padding of `Screen` content, and the gap between cards. */
const GUTTER = 24;
const GAP = 12;
const MAX_CARD_WIDTH = 360;
const OVERLAY = "rgba(0,0,0,0.6)";

/** Nothing when no product has a photo. */
export function DonationPhotos({
  items,
}: {
  items: readonly DonacionItemDto[];
}) {
  const { width } = useWindowDimensions();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const photos = photosOf(items);
  if (photos.length === 0) return null;

  const single = photos.length === 1;
  const fullWidth = Math.min(width - GUTTER * 2, MAX_CARD_WIDTH * 1.4);
  // With several photos the next card peeks in, hinting that the row scrolls.
  const cardWidth = single
    ? fullWidth
    : Math.min(fullWidth * 0.82, MAX_CARD_WIDTH);

  return (
    <Section title="Fotografías">
      <FlatList
        horizontal
        data={photos}
        keyExtractor={(photo) => photo.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + GAP}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
        renderItem={({ item: photo, index }) => (
          <Pressing
            accessibilityRole="button"
            accessibilityLabel={`Ver foto de ${photo.name}`}
            accessibilityHint="Abre la foto en pantalla completa"
            onPress={() => setOpenIndex(index)}
            surface={[styles.card, { width: cardWidth }]}
          >
            <Image
              source={source(photo)}
              contentFit="cover"
              recyclingKey={photo.id}
              style={styles.fill}
            />
            {single ? null : (
              <View style={[styles.chip, styles.count]}>
                <Copy weight="semibold" style={styles.chipText}>
                  {`${index + 1}/${photos.length}`}
                </Copy>
              </View>
            )}
            <View style={[styles.chip, styles.name]}>
              <Copy weight="semibold" style={styles.chipText}>
                {photo.name}
              </Copy>
            </View>
            <View style={[styles.chip, styles.expand]}>
              <Icon name="expand" size={16} color="#fff" />
            </View>
          </Pressing>
        )}
      />
      {openIndex !== null ? (
        <PhotoViewer
          photos={photos}
          initialIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </Section>
  );
}

/** Full-screen, paged viewer opened on `initialIndex`; mounted only while open. */
function PhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const [shown, setShown] = useState(initialIndex);

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.viewer}>
        <View style={styles.viewerHeader}>
          <Copy weight="semibold" style={styles.viewerText}>
            {photos.length > 1 ? `Foto ${shown + 1} de ${photos.length}` : ""}
          </Copy>
          <Pressing
            accessibilityRole="button"
            accessibilityLabel="Cerrar foto"
            onPress={onClose}
            scale={0.92}
            surface={styles.closeButton}
          >
            <Icon name="close" size={22} color="#fff" />
          </Pressing>
        </View>
        <FlatList
          horizontal
          pagingEnabled
          data={photos}
          keyExtractor={(photo) => photo.id}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({
            length: width,
            offset: width * i,
            index: i,
          })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) =>
            setShown(Math.round(event.nativeEvent.contentOffset.x / width))
          }
          style={styles.pager}
          renderItem={({ item: photo }) => (
            <View style={[styles.page, { width }]}>
              <Image
                source={source(photo)}
                contentFit="contain"
                style={styles.fill}
                accessibilityLabel={`Foto de ${photo.name}`}
              />
            </View>
          )}
        />
        <Copy
          weight="semibold"
          style={[styles.viewerText, styles.viewerCaption]}
        >
          {photos[shown]?.name ?? ""}
        </Copy>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { gap: GAP },
  card: {
    aspectRatio: 4 / 3,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.muted,
  },
  fill: { width: "100%", height: "100%" },
  chip: {
    position: "absolute",
    backgroundColor: OVERLAY,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: "#fff", fontSize: 13 },
  count: { top: 10, right: 10 },
  name: { left: 10, bottom: 10, maxWidth: "70%" },
  expand: {
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    padding: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  viewer: { flex: 1, backgroundColor: "#000" },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    minHeight: 56,
  },
  viewerText: { color: "#fff" },
  viewerCaption: { textAlign: "center", padding: 16 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  pager: { flex: 1 },
  page: { height: "100%", paddingHorizontal: 8 },
});
