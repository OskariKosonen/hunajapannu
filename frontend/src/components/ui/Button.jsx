import { forwardRef } from "react";
import { buttonClass } from "./buttonClass";

const Button = forwardRef(function Button(
  { variant = "secondary", size = "sm", className = "", type = "button", ...rest },
  ref
) {
  return <button ref={ref} type={type} className={buttonClass({ variant, size, className })} {...rest} />;
});

export default Button;
