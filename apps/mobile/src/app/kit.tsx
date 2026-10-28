import { KitGallery } from '../ui/gallery/KitGallery';

// Dev/QA only: reached by deep link (creditcoach://kit) from the Maestro gallery flow. Nothing in the
// user UI links here, and the layout does not register it, so the demo path is unchanged.
export default function KitRoute() {
  return <KitGallery />;
}
