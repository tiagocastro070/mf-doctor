import React from "react";

export const Button = ({ children, onClick, variant = "primary" }) => {
  const styles = {
    primary: { backgroundColor: "#007bff", color: "white" },
    secondary: { backgroundColor: "#6c757d", color: "white" },
  };

  return (
    <button
      onClick={onClick}
      style={{ padding: "8px 16px", ...styles[variant] }}
    >
      {children}
    </button>
  );
};

export default Button;
