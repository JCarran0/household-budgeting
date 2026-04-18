import {
  IconBed,
  IconToolsKitchen2,
  IconMasksTheater,
  IconCar,
  IconPlane,
  IconTrain,
  IconWalk,
  IconBus,
  IconArrowRight,
  type IconProps,
} from '@tabler/icons-react';
import type { Stop, TransitMode } from '../../../../../shared/types';

export function transitIcon(mode: TransitMode) {
  switch (mode) {
    case 'drive':
      return IconCar;
    case 'flight':
      return IconPlane;
    case 'train':
      return IconTrain;
    case 'walk':
      return IconWalk;
    case 'shuttle':
      return IconBus;
    case 'other':
    default:
      return IconArrowRight;
  }
}

export function stopIcon(stop: Stop) {
  switch (stop.type) {
    case 'stay':
      return IconBed;
    case 'eat':
      return IconToolsKitchen2;
    case 'play':
      return IconMasksTheater;
    case 'transit':
      return transitIcon(stop.mode);
  }
}

/** Tabler icon props without `ref`, safe to spread. */
export type StopIconProps = Omit<IconProps, 'ref'>;
