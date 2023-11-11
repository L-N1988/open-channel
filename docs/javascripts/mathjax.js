window.MathJax = {
    tex: {
      inlineMath: [["\\(", "\\)"]],
      displayMath: [["\\[", "\\]"]],
      processEscapes: true,
      processEnvironments: true
    },
    startup: {
    ready() {
      MathJax.startup.defaultReady();
      MathJax.startup.document.inputJax[0].preFilters.add(
        ({math}) => {
          if (math.display === false) {
            math.math = '\\displaystyle{' + math.math + '}';
          }
        }
      );
    }
  }
  };
  
  document$.subscribe(() => {
    MathJax.typesetPromise()
  })
