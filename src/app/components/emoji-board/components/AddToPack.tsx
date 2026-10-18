import React, { useCallback, useState } from 'react';
import { Box, Button, Chip, Icon, IconButton, Icons, Scroll, Spinner, Text, config } from 'folds';
import { MatrixClient } from 'matrix-js-sdk';
import { ImagePack, ImageUsage, PackContent, PackImage } from '../../../plugins/custom-emoji';
import { StateEvent } from '../../../../types/matrix/room';
import { AccountDataEvent } from '../../../../types/matrix/accountData';
import { useFilePicker } from '../../../hooks/useFilePicker';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { CompactUploadCardRenderer } from '../../upload-card';
import { ImageTileUpload } from '../../image-pack-view/ImageTile';
import { SequenceCard } from '../../sequence-card';
import { UploadSuccess } from '../../../state/upload';
import { getImageInfo, isUserId, TUploadContent } from '../../../utils/matrix';
import { getImageFileUrl, loadImageElement, renameFile } from '../../../utils/dom';
import { replaceSpaceWithDash, suffixRename } from '../../../utils/common';
import { getFileNameWithoutExt } from '../../../utils/mimeTypes';

type UploadedImage = {
  shortcode: string;
  image: PackImage;
};

const getPackLabel = (mx: MatrixClient, pack: ImagePack): string =>
  pack.meta.name || (isUserId(pack.id) ? 'Personal Pack' : mx.getRoom(pack.id)?.name) || 'Unknown';

const commitPack = async (mx: MatrixClient, pack: ImagePack, content: PackContent) => {
  const { address } = pack;
  if (address) {
    await mx.sendStateEvent(address.roomId, StateEvent.PoniesRoomEmotes, content, address.stateKey);
  } else {
    await mx.setAccountData(AccountDataEvent.PoniesUserEmotes, content);
  }
};

type AddToPackProps = {
  mx: MatrixClient;
  packs: ImagePack[];
  onDone: () => void;
  onCancel: () => void;
};
export function AddToPack({ mx, packs, onDone, onCancel }: AddToPackProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    packs.length === 1 ? packs[0].id : undefined
  );
  const pack = packs.find((p) => p.id === selectedId);

  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<UploadedImage[]>([]);

  const hasShortcode = useCallback(
    (shortcode: string, pending: File[] = files): boolean =>
      !!pack?.images.collection.has(shortcode) ||
      uploaded.some((u) => u.shortcode === shortcode) ||
      pending.some((f) => getFileNameWithoutExt(f.name) === shortcode),
    [pack, uploaded, files]
  );

  const pickFiles = useFilePicker(
    useCallback(
      (picked: File[]) => {
        const batch: File[] = [];
        picked.forEach((file) => {
          const name = replaceSpaceWithDash(file.name);
          const shortcode = getFileNameWithoutExt(name);
          const isTaken = (sc: string) => hasShortcode(sc, [...files, ...batch]);
          if (isTaken(shortcode)) {
            const ext = name.slice(shortcode.length);
            batch.push(renameFile(file, suffixRename(shortcode, isTaken) + ext));
          } else {
            batch.push(name !== file.name ? renameFile(file, name) : file);
          }
        });
        setFiles((f) => [...f, ...batch]);
      },
      [hasShortcode, files]
    ),
    true
  );

  const handleRemove = useCallback((file: TUploadContent) => {
    setFiles((fs) => fs.filter((f) => f !== file));
  }, []);

  const handleComplete = useCallback(
    async (data: UploadSuccess) => {
      const imgEl = await loadImageElement(getImageFileUrl(data.file));
      setUploaded((u) => [
        ...u,
        {
          shortcode: getFileNameWithoutExt(data.file.name),
          image: {
            url: data.mxc,
            info: getImageInfo(imgEl, data.file),
            usage: [ImageUsage.Sticker],
          },
        },
      ]);
      handleRemove(data.file);
    },
    [handleRemove]
  );

  const [commitState, commit] = useAsyncCallback(
    useCallback(async () => {
      if (!pack) return;
      const images: Record<string, PackImage> = {};
      pack.images.collection.forEach((img, shortcode) => {
        images[shortcode] = img.content;
      });
      uploaded.forEach((u) => {
        images[u.shortcode] = u.image;
      });
      await commitPack(mx, pack, { pack: pack.meta.content, images });
      onDone();
    }, [mx, pack, uploaded, onDone])
  );
  const committing = commitState.status === AsyncStatus.Loading;
  const canCommit = !!pack && uploaded.length > 0 && files.length === 0 && !committing;

  const renderBody = () => {
    if (packs.length === 0) {
      return <Text size="T300">You have no sticker packs you can edit.</Text>;
    }
    if (!pack) {
      return (
        <Box direction="Column" gap="100">
          <Text size="L400">Add to pack</Text>
          {packs.map((p) => (
            <Chip
              key={p.id}
              variant="SurfaceVariant"
              radii="300"
              onClick={() => setSelectedId(p.id)}
            >
              <Text size="T300">{getPackLabel(mx, p)}</Text>
            </Chip>
          ))}
        </Box>
      );
    }
    return (
      <Box direction="Column" gap="200">
        <Box alignItems="Center" gap="200">
          <Box grow="Yes">
            <Text size="L400" truncate>
              Add to {getPackLabel(mx, pack)}
            </Text>
          </Box>
          {packs.length > 1 && (
            <Chip
              variant="SurfaceVariant"
              radii="Pill"
              disabled={files.length > 0 || uploaded.length > 0 || committing}
              onClick={() => setSelectedId(undefined)}
            >
              <Text size="B300">Change</Text>
            </Chip>
          )}
        </Box>
        <Button
          variant="Secondary"
          fill="Soft"
          size="300"
          radii="300"
          type="button"
          outlined
          disabled={committing}
          onClick={() => pickFiles('image/*')}
        >
          <Text size="B300">Select images</Text>
        </Button>
        {files.map((file) => (
          <SequenceCard
            key={file.name}
            style={{ padding: config.space.S300 }}
            variant="SurfaceVariant"
            direction="Column"
            gap="400"
          >
            <ImageTileUpload file={file}>
              {(uploadAtom) => (
                <CompactUploadCardRenderer
                  uploadAtom={uploadAtom}
                  onRemove={handleRemove}
                  onComplete={handleComplete}
                />
              )}
            </ImageTileUpload>
          </SequenceCard>
        ))}
        {uploaded.length > 0 && (
          <Text size="T200">
            {uploaded.length} image{uploaded.length === 1 ? '' : 's'} uploaded:{' '}
            {uploaded.map((u) => u.shortcode).join(', ')}
          </Text>
        )}
        {commitState.status === AsyncStatus.Error && (
          <Text size="T200" style={{ color: 'var(--critical, inherit)' }}>
            <b>Failed to add to the pack. Please try again.</b>
          </Text>
        )}
        <Button
          variant="Primary"
          size="300"
          radii="300"
          disabled={!canCommit}
          before={committing && <Spinner variant="Primary" fill="Solid" size="100" />}
          onClick={commit}
        >
          <Text size="B300">{commitState.status === AsyncStatus.Error ? 'Retry' : 'Add'}</Text>
        </Button>
      </Box>
    );
  };

  return (
    <Box grow="Yes" direction="Column">
      <Box alignItems="Center" gap="200" style={{ padding: config.space.S200 }} shrink="No">
        <IconButton size="300" radii="300" onClick={onCancel} disabled={committing}>
          <Icon size="100" src={Icons.ArrowLeft} />
        </IconButton>
        <Text size="T300">Cancel</Text>
      </Box>
      <Scroll size="400" hideTrack>
        <Box direction="Column" style={{ padding: config.space.S200 }}>
          {renderBody()}
        </Box>
      </Scroll>
    </Box>
  );
}
