import { numberFormat, t } from '../i18n.js';

export const formatHP = value => value > 0 && value < 0.1
  ? `<${numberFormat.format(0.1)}` : numberFormat.format(value);
export const hpAmount = value => t('hpAmount', { value, unit: t('hpUnit') });
export const timecode = seconds => [Math.floor(seconds / 60), Math.floor(seconds % 60)]
  .map(value => String(value).padStart(2, '0')).join(':');
