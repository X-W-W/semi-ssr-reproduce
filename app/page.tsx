import ReproClient from './ReproClient';

export default function HomePage() {
  return (
    <main>
      <h1>Semi SSR Root Import Repro</h1>
      <p>
        This page is a server component. The button below is rendered by a client
        component that imports from the Semi UI package root.
      </p>
      <ReproClient />
    </main>
  );
}
