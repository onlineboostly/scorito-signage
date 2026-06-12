import { redirect } from 'next/navigation';

export default function PoolHome({ params }: { params: { poolId: string } }) {
  redirect(`/${params.poolId}/stand`);
}
