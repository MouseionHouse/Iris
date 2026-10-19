import React, { useCallback, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Icon,
  IconButton,
  Icons,
  Input,
  Scroll,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import {
  getPackLabel,
  ImagePack,
  ImageUsage,
  normalizeShortcode,
  packKey,
  PackImage,
  shortcodeError,
  updatePack,
  withImage,
} from '../../../plugins/custom-emoji';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useFilePicker } from '../../../hooks/useFilePicker';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { CompactUploadCardRenderer } from '../../upload-card';
import { ImageTileUpload } from '../../image-pack-view/ImageTile';
import { SequenceCard } from '../../sequence-card';
import { UploadSuccess } from '../../../state/upload';
import { getImageInfo, TUploadContent } from '../../../utils/matrix';
import { getImageFileUrl, loadImageElement } from '../../../utils/dom';
import { replaceSpaceWithDash } from '../../../utils/common';
import { getFileNameWithoutExt } from '../../../utils/mimeTypes';

type UploadEntry = {
  id: number;
  file: File;
  name: string;
  image?: PackImage;
};

type AddToPackProps = {
  packs: ImagePack[];
  /** Open on this pack (a `packKey`) and skip the pack picker. */
  initialPackKey?: string;
  onDone: (count: number, pack: ImagePack) => void;
  onCancel: () => void;
};
export function AddToPack({ packs, initialPackKey, onDone, onCancel }: AddToPackProps) {
  const mx = useMatrixClient();
  const [selectedKey, setSelectedKey] = useState<string | undefined>(
    initialPackKey ?? (packs.length === 1 ? packKey(packs[0]) : undefined)
  );
  const pack = packs.find((p) => packKey(p) === selectedKey);

  const nextId = useRef(0);
  const [entries, setEntries] = useState<UploadEntry[]>([]);

  const nameError = (entry: UploadEntry): string | undefined =>
    shortcodeError(
      normalizeShortcode(entry.name),
      (shortcode) =>
        !!pack?.images.collection.has(shortcode) ||
        entries.some((e) => e.id !== entry.id && normalizeShortcode(e.name) === shortcode)
    );

  const pickFiles = useFilePicker(
    useCallback((picked: File[]) => {
      setEntries((es) => [
        ...es,
        ...picked.map((file) => {
          nextId.current += 1;
          return {
            id: nextId.current,
            file,
            name: getFileNameWithoutExt(replaceSpaceWithDash(file.name)),
          };
        }),
      ]);
    }, []),
    true
  );

  const handleRemove = useCallback((file: TUploadContent) => {
    setEntries((es) => es.filter((e) => e.file !== file));
  }, []);

  const handleNameChange = (id: number, value: string) => {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, name: value } : e)));
  };

  // The upload card can report success again when it re-renders, so this is idempotent.
  const handleComplete = useCallback(async (data: UploadSuccess) => {
    const imgEl = await loadImageElement(getImageFileUrl(data.file));
    const image: PackImage = {
      url: data.mxc,
      info: getImageInfo(imgEl, data.file),
      usage: [ImageUsage.Sticker],
    };
    setEntries((es) => es.map((e) => (e.file === data.file && !e.image ? { ...e, image } : e)));
  }, []);

  const [commitState, commit] = useAsyncCallback(
    useCallback(async () => {
      if (!pack) return;
      const ready = entries.flatMap((e) =>
        e.image ? [{ shortcode: normalizeShortcode(e.name), image: e.image }] : []
      );
      await updatePack(mx, pack.address, (content) =>
        ready.reduce((c, { shortcode, image }) => withImage(c, shortcode, image), content)
      );
      onDone(ready.length, pack);
    }, [mx, pack, entries, onDone])
  );
  const committing = commitState.status === AsyncStatus.Loading;
  const uploading = entries.some((e) => !e.image);
  const invalid = entries.some((e) => nameError(e) !== undefined);
  const canCommit = !!pack && entries.length > 0 && !uploading && !invalid && !committing;

  const renderEntry = (entry: UploadEntry) => {
    const error = nameError(entry);
    const errorId = `AddToPack-${entry.id}-error`;
    return (
      <SequenceCard
        key={entry.id}
        style={{ padding: config.space.S300 }}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <ImageTileUpload file={entry.file}>
          {(uploadAtom) => (
            <Box direction="Column" gap="200">
              <Box direction="Column" gap="100">
                <Input
                  before={<Text size="L400">Name:</Text>}
                  value={entry.name}
                  onChange={(evt) => handleNameChange(entry.id, evt.currentTarget.value)}
                  aria-label="Sticker name"
                  aria-invalid={!!error}
                  aria-describedby={error ? errorId : undefined}
                  variant={error ? 'Critical' : 'Secondary'}
                  size="300"
                  radii="300"
                  readOnly={committing}
                />
                {error && (
                  <Text id={errorId} size="T200" style={{ color: color.Critical.Main }}>
                    {error}
                  </Text>
                )}
              </Box>
              {entry.image ? (
                <Box alignItems="Center" gap="200">
                  <Icon style={{ color: color.Success.Main }} src={Icons.Check} size="100" />
                  <Box grow="Yes">
                    <Text size="T200">Uploaded</Text>
                  </Box>
                  <IconButton
                    onClick={() => handleRemove(entry.file)}
                    aria-label="Remove"
                    variant="SurfaceVariant"
                    radii="Pill"
                    size="300"
                    disabled={committing}
                  >
                    <Icon src={Icons.Cross} size="200" />
                  </IconButton>
                </Box>
              ) : (
                <CompactUploadCardRenderer
                  uploadAtom={uploadAtom}
                  onRemove={handleRemove}
                  onComplete={handleComplete}
                />
              )}
            </Box>
          )}
        </ImageTileUpload>
      </SequenceCard>
    );
  };

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
              key={packKey(p)}
              variant="SurfaceVariant"
              radii="300"
              onClick={() => setSelectedKey(packKey(p))}
            >
              <Text size="T300">{getPackLabel(mx, p)}</Text>
            </Chip>
          ))}
        </Box>
      );
    }
    const count = entries.length;
    return (
      <Box direction="Column" gap="200">
        <Box alignItems="Center" gap="200">
          <Box grow="Yes">
            <Text size="L400" truncate>
              Add to {getPackLabel(mx, pack)}
            </Text>
          </Box>
          {packs.length > 1 && !initialPackKey && (
            <Chip
              variant="SurfaceVariant"
              radii="Pill"
              disabled={count > 0 || committing}
              onClick={() => setSelectedKey(undefined)}
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
        {entries.map(renderEntry)}
        {commitState.status === AsyncStatus.Error && (
          <Text size="T200" style={{ color: color.Critical.Main }}>
            <b>Failed to add to the pack. Please try again.</b>
          </Text>
        )}
        <Button
          variant="Primary"
          size="300"
          radii="300"
          disabled={!canCommit}
          before={committing && <Spinner variant="Primary" fill="Solid" size="100" />}
          onClick={() => commit().catch(() => undefined)}
        >
          <Text size="B300">
            {commitState.status === AsyncStatus.Error
              ? 'Retry'
              : `Add ${count > 0 ? `${count} ` : ''}sticker${count === 1 ? '' : 's'}`}
          </Text>
        </Button>
      </Box>
    );
  };

  return (
    <Box grow="Yes" direction="Column">
      <Box alignItems="Center" gap="200" style={{ padding: config.space.S200 }} shrink="No">
        <IconButton
          size="300"
          radii="300"
          onClick={onCancel}
          disabled={committing}
          aria-label="Cancel"
        >
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
