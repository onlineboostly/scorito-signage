import { redirect } from 'next/navigation';
import { DEFAULT_POOL_ID } from '@/lib/config';

export default function Home() {
  redirect(`/${DEFAULT_POOL_ID}/stand`);
}
