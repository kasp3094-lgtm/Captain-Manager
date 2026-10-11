export function FatalError({ message }: { message: string }) {
  return (
    <div className="screen">
      <div className="card" role="alert">
        <p className="eyebrow">Can't start</p>
        <h1 className="title small">The ship won't load</h1>
        <p className="tagline">
          This game needs WebGL 2. Try a current version of Chrome, Edge or Firefox, and check that
          hardware acceleration is switched on.
        </p>
        <pre className="error-detail">{message}</pre>
      </div>
    </div>
  );
}
