import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="wrap">
      <p className="eyebrow">404</p>
      <h1>No such page</h1>
      <p className="lede">
        That URL does not match anything here. The <Link to="/dolls">doll database</Link> and the{" "}
        <Link to="/farming">farming explorer</Link> are the two places worth starting from.
      </p>
    </div>
  );
}
