// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      gridTemplateColumns: {
        "auto-fit-max-content": "repeat(auto-fit, minmax(max-content, 1fr))",
      },
    },
  },
};
