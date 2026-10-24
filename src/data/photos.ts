/**
 * 写真素材の共通データ。CREDITS.md と内容を一致させること。
 * すべて Flickr 上で CC BY 2.0 / CC BY-SA 2.0 / Public Domain Mark 1.0 が付与された実写素材。
 * 素材写真であり、架空事業者「緑整」の施工実績ではない。
 */
export type PhotoLicense = 'CC BY 2.0' | 'CC BY-SA 2.0' | 'Public Domain Mark 1.0';

export interface Photo {
  id: string;
  alt: string;
  /** 960 版の実寸（480 版は同比率） */
  width: number;
  height: number;
  creator: string;
  source: string;
  license: PhotoLicense;
  licenseUrl: string;
  /** デモ写真として相談フォームで選べるか */
  demoSelectable?: boolean;
  /** デモ写真として選ぶときの短い説明 */
  demoLabel?: string;
}

const BY = 'https://creativecommons.org/licenses/by/2.0/';
const BYSA = 'https://creativecommons.org/licenses/by-sa/2.0/';
const PDM = 'https://creativecommons.org/publicdomain/mark/1.0/';

export const PHOTOS: Photo[] = [
  {
    id: 'hero-brushcutter-crew',
    alt: 'ヘルメットと手袋を着けた作業者が、斜面の草を刈払機で刈っている様子',
    width: 960, height: 640,
    creator: 'National Interagency Fire Center',
    source: 'https://www.flickr.com/photos/165415395@N07/52149861724',
    license: 'Public Domain Mark 1.0', licenseUrl: PDM,
  },
  {
    id: 'kusakari-residence',
    alt: '住宅の敷地で、ヘルメット姿の作業者が伸びた草を刈り、一輪車で運ぶ準備をしている様子',
    width: 499, height: 401,
    creator: 'jetalone',
    source: 'https://www.flickr.com/photos/92203585@N00/15434372981',
    license: 'CC BY 2.0', licenseUrl: BY,
  },
  {
    id: 'kusakari-trimmer',
    alt: 'ナイロンコード式の草刈り機で草を刈っている足元の様子',
    width: 960, height: 638,
    creator: 'sacks08',
    source: 'https://www.flickr.com/photos/29071316@N06/5280723099',
    license: 'CC BY 2.0', licenseUrl: BY,
  },
  {
    id: 'kusatori-hand',
    alt: '手袋を着けた作業者が、砂利の地面に生えた雑草を手で抜いている様子',
    width: 960, height: 720,
    creator: 'USFWS Mountain Prairie',
    source: 'https://www.flickr.com/photos/51986662@N05/23160907112',
    license: 'CC BY 2.0', licenseUrl: BY,
  },
  {
    id: 'weeds-gravel',
    alt: '砂利を敷いた地面のすき間から雑草が伸びている様子',
    width: 960, height: 720,
    creator: '__U___',
    source: 'https://www.flickr.com/photos/57723509@N04/53085309216',
    license: 'CC BY 2.0', licenseUrl: BY,
    demoSelectable: true, demoLabel: '砂利のすき間の雑草',
  },
  {
    id: 'weeds-sidepath',
    alt: '住宅の外壁と塀の間の細い通路に、雑草が一面に茂っている様子',
    width: 768, height: 1024,
    creator: 'Norisa1',
    source: 'https://www.flickr.com/photos/40781985@N08/52188204055',
    license: 'CC BY 2.0', licenseUrl: BY,
    demoSelectable: true, demoLabel: '建物の横の通路の雑草',
  },
  {
    id: 'collected-weeds',
    alt: '抜いた草を袋にまとめ、塀ぎわに並べて置いている様子',
    width: 960, height: 720,
    creator: 'Rachel M Coleman',
    source: 'https://www.flickr.com/photos/7509906@N07/3448428990',
    license: 'CC BY-SA 2.0', licenseUrl: BYSA,
  },
  {
    id: 'bassai-crosscut',
    alt: '防護ズボンとイヤーマフを着けた作業者が、伐採した幹をチェーンソーで切り分けている様子',
    width: 960, height: 720,
    creator: 'Hans Fransen',
    source: 'https://www.flickr.com/photos/38923206@N00/39827856644',
    license: 'Public Domain Mark 1.0', licenseUrl: PDM,
  },
  {
    id: 'bassai-logs',
    alt: '切り分けた幹を塀ぎわに積み上げている様子',
    width: 960, height: 720,
    creator: 'Hans Fransen',
    source: 'https://www.flickr.com/photos/38923206@N00/39827853554',
    license: 'Public Domain Mark 1.0', licenseUrl: PDM,
  },
  {
    id: 'tree-on-site',
    alt: '住宅の敷地内に立つ木と、下ろした枝が地面に積まれている様子',
    width: 960, height: 720,
    creator: 'Hans Fransen',
    source: 'https://www.flickr.com/photos/38923206@N00/39827858024',
    license: 'Public Domain Mark 1.0', licenseUrl: PDM,
    demoSelectable: true, demoLabel: '敷地内の木と枝',
  },
  {
    id: 'overgrown-yard',
    alt: '住宅の前の敷地一面に、草がひざ丈ほどまで伸びている様子',
    width: 960, height: 720,
    creator: 'IainCameron',
    source: 'https://www.flickr.com/photos/67872859@N00/42594618972',
    license: 'CC BY 2.0', licenseUrl: BY,
    demoSelectable: true, demoLabel: '家の前の伸びた草',
  },
  {
    id: 'mowed-lot',
    alt: '草を短く刈った、木の立つ空き地の様子',
    width: 960, height: 720,
    creator: 'pasa47',
    source: 'https://www.flickr.com/photos/53301297@N00/8717461557',
    license: 'CC BY 2.0', licenseUrl: BY,
    demoSelectable: true, demoLabel: '草を刈った空き地（定期的な相談）',
  },
];

export const DEMO_PHOTOS = PHOTOS.filter((p) => p.demoSelectable);

export function getPhoto(id: string): Photo | undefined {
  return PHOTOS.find((p) => p.id === id);
}

export function photoSrc(id: string, size: 480 | 960): string {
  return `/images/${id}-${size}.webp`;
}
