/** アイコンは Lucide（ISC License）1セットに統一。装飾扱いで aria-hidden を付ける */
import phone from 'lucide-static/icons/phone.svg?raw';
import camera from 'lucide-static/icons/camera.svg?raw';
import calculator from 'lucide-static/icons/calculator.svg?raw';
import message from 'lucide-static/icons/message-circle.svg?raw';
import chevronDown from 'lucide-static/icons/chevron-down.svg?raw';
import chevronRight from 'lucide-static/icons/chevron-right.svg?raw';
import arrowRight from 'lucide-static/icons/arrow-right.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import image from 'lucide-static/icons/image.svg?raw';
import calendar from 'lucide-static/icons/calendar.svg?raw';
import mapPin from 'lucide-static/icons/map-pin.svg?raw';
import clock from 'lucide-static/icons/clock.svg?raw';
import info from 'lucide-static/icons/info.svg?raw';
import alert from 'lucide-static/icons/circle-alert.svg?raw';
import trash from 'lucide-static/icons/trash-2.svg?raw';
import upload from 'lucide-static/icons/upload.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import refresh from 'lucide-static/icons/refresh-cw.svg?raw';
import list from 'lucide-static/icons/list.svg?raw';
import fileText from 'lucide-static/icons/file-text.svg?raw';
import externalLink from 'lucide-static/icons/external-link.svg?raw';

const RAW = {
  phone, camera, calculator, message, chevronDown, chevronRight, arrowRight, check, x, image,
  calendar, mapPin, clock, info, alert, trash, upload, lock, refresh, list, fileText, externalLink,
};
export type IconName = keyof typeof RAW;

export function icon(name: IconName, cls = 'icon'): string {
  return RAW[name]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace('<svg', `<svg class="${cls}" aria-hidden="true" focusable="false"`)
    .replace(/\s(width|height)="24"/g, '')
    .trim();
}

/** HTML 内の <span data-icon="name"></span> を SVG に置き換える */
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    const name = el.dataset.icon as IconName;
    if (RAW[name] && !el.firstElementChild) el.innerHTML = icon(name);
  });
}
