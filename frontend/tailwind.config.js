export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        zitask: {
          primary: '#024656', // Azul Escuro
          secondary: '#43B7BF', // Azul Turquesa
          neutral: '#B6BBAC', // Cinza Esverdeado
          accent: '#DCD3A5', // Bege
          warning: '#F2A71B', // Laranja/Ouro
        },
        dark: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
        }
      }
    },
  },
  plugins: [],
  darkMode: 'class',
}
