import React from "react";

export const Button = ({ children, onClick }) => {
  return (
    <button onClick={onClick} style={{ padding: "8px 16px" }}>
      {children}
    </button>
  );
};

export default Button;
