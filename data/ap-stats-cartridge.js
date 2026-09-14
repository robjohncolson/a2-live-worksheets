// Algebra 2 cartridge data and deck-specific behavior.
(function(){
const AP_STATS_CARTRIDGE={
  id:'ap-stats-formulas',
  name:'Algebra 2',
  description:'Formula defense for the 2026 Algebra 2 exam',
  icon:'📊',
  inputMode:'quiz',
  prefixLabel:null,
  title:'AP STATS',
  subtitle:'FORMULA DEFENSE',
  startButton:'DEPLOY',
  instructions:'Enemies carry formulas rendered in LaTeX.<br><b>Identify</b>: pick what the formula calculates (A\u2013D)<br><b>Fill-blank</b>: pick the missing symbol or term (A\u2013C)',
  instructionsSub:'Wrong answer = enemy surges forward and fractures into harder variants \u00b7 Alt+E = explain / watch / close<br>Tab = cycle \u00b7 12 waves',
  commands:[
    // ══ I. DESCRIPTIVE STATISTICS ══
    {id:'mean',action:'Sample Mean (x-bar)',tier:'core',dom:'descriptive',
      hint:'Add all values, divide by count',
      explain:'This measures the center — total divided by how many',
      latex:'\\bar{x} = \\frac{\\sum x_i}{n}',
      blanks:[{latex:'\\bar{x} = \\frac{\\sum x_i}{\\boxed{\\,?\\,}}',answer:'n',choices:['n','n-1','\\mu']}],
      subconcepts:[{q:'What does \u03a3 (sigma) mean here?',correct:'Sum all values',wrong:['Multiply all values','Find the median']},{q:'Why divide by n?',correct:'To find the average per observation',wrong:['To convert to percentage','To adjust for bias']},{q:'What does x-bar estimate?',correct:'The population mean \u03bc',wrong:['The population SD','The median']}]},
    {id:'std-dev',action:'Sample Standard Deviation (s)',tier:'core',dom:'descriptive',
      hint:'Square root of variance; denominator is n-1',
      explain:'Measures spread; uses degrees of freedom to correct for sample bias',
      latex:'s_x = \\sqrt{\\frac{\\sum(x_i-\\bar{x})^2}{n-1}}',
      blanks:[{latex:'s_x = \\sqrt{\\frac{\\sum(x_i-\\bar{x})^2}{\\boxed{\\,?\\,}}}',answer:'n-1',choices:['n-1','n','n+1']}],
      subconcepts:[{q:'Why subtract x-bar from each value?',correct:'To measure deviation from the mean',wrong:['To normalize each value','To remove outliers']},{q:'Why use n-1 instead of n?',correct:'Degrees of freedom correction for samples',wrong:['To make the value smaller','Because one data point is dropped from the sample']},{q:'Why take the square root?',correct:'To convert variance back to original units',wrong:['To make the value smaller','To normalize the distribution']}]},
    {id:'linreg',action:'Least-Squares Regression Line (\u0177)',tier:'core',dom:'descriptive',
      hint:'\u0177 = a + bx (intercept + slope\u00b7x)',
      explain:'Predicted y from x — intercept plus slope times x',
      latex:'\\hat{y} = a + bx',
      blanks:[{latex:'\\hat{y} = a + \\boxed{\\,?\\,}\\cdot x',answer:'b',choices:['b','r','a']}],
      subconcepts:[{q:'What does "a" represent?',correct:'The y-intercept (predicted y when x=0)',wrong:['The slope of the line','The correlation coefficient']},{q:'What does "b" represent?',correct:'The slope (change in \u0177 per unit x)',wrong:['The y-intercept','The residual']},{q:'Why use \u0177 instead of y?',correct:'\u0177 is predicted, not observed',wrong:['\u0177 is always larger','It removes outliers']}]},
    {id:'linreg-mean',action:'y\u0305 from LSRL at Point of Means (x\u0305, y\u0305)',tier:'core',dom:'descriptive',
      hint:'The regression line passes through the point of means',
      explain:'The line must pass through the centroid of the data',
      latex:'\\bar{y} = a + b\\bar{x}',
      blanks:[{latex:'\\bar{y} = a + b\\cdot\\boxed{\\,?\\,}',answer:'xbar',choices:['\\bar{x}','x','n']}],
      subconcepts:[{q:'What is the point of means?',correct:'The point (x-bar, y-bar)',wrong:['The median of x and y','The origin (0,0)']},{q:'Why must the line pass through (x-bar, y-bar)?',correct:'It minimizes squared residuals',wrong:['Because a=0','Because r=1']},{q:'What does b\u00b7x-bar calculate?',correct:'The slope contribution at the mean of x',wrong:['The correlation at x-bar','The residual at x-bar']}]},
    {id:'corr-r',action:'Correlation Coefficient (r)',tier:'regular',dom:'descriptive',
      hint:'Sum of products of z-scores, divided by n-1',
      explain:'Standardizes both variables to z-scores first, then averages their products',
      latex:'r = \\frac{1}{n-1}\\sum\\!\\left(\\frac{x_i-\\bar{x}}{s_x}\\right)\\!\\left(\\frac{y_i-\\bar{y}}{s_y}\\right)',
      blanks:[{latex:'r = \\frac{1}{\\boxed{\\,?\\,}}\\sum\\!\\left(\\frac{x_i-\\bar{x}}{s_x}\\right)\\!\\left(\\frac{y_i-\\bar{y}}{s_y}\\right)',answer:'n-1',choices:['n-1','n','n+1']}],
      subconcepts:[{q:'What is a z-score?',correct:'How many SDs a value is from the mean',wrong:['The percentile rank','The raw deviation']},{q:'Why divide by n-1?',correct:'Degrees of freedom for sample correlation',wrong:['To make r between 0 and 1','To adjust for skewness']},{q:'What does r=0 mean?',correct:'No linear relationship',wrong:['No relationship of any kind','Variables are independent']}]},
    {id:'slope-b',action:'Regression Slope (b)',tier:'core',dom:'descriptive',
      hint:'r times the ratio of standard deviations',
      explain:'Strength of relationship scaled by the ratio of variabilities',
      latex:'b = r\\,\\frac{s_y}{s_x}',
      blanks:[{latex:'b = \\boxed{\\,?\\,}\\,\\frac{s_y}{s_x}',answer:'r',choices:['r','b','s']}],
      subconcepts:[{q:'What does r measure here?',correct:'Strength and direction of linear association',wrong:['The slope itself','Percentage of variation explained']},{q:'Why multiply r by sy/sx?',correct:'To scale correlation to units of y per x',wrong:['To normalize the slope','To remove the intercept']},{q:'If r=1 and sy=sx, what is b?',correct:'b = 1',wrong:['b = 0','b = r\u00b2']}]},

    // ══ II. PROBABILITY ══
    {id:'add-rule',action:'Addition Rule for Probability',tier:'core',dom:'probability',
      hint:'Add individual, subtract the overlap',
      explain:'Events can overlap — subtract what you double-counted',
      latex:'P(A \\cup B) = P(A) + P(B) - P(A \\cap B)',
      blanks:[{latex:'P(A \\cup B) = P(A) + P(B) - \\boxed{\\,?\\,}',answer:'P(A\\cap B)',choices:['P(A\\cap B)','P(A\\cup B)','P(A)P(B)']}],
      subconcepts:[{q:'What does P(A\u2229B) represent?',correct:'Probability both A and B occur',wrong:['Probability either occurs','Probability A causes B']},{q:'Why subtract P(A\u2229B)?',correct:'To avoid double-counting the overlap',wrong:['Because A and B are independent','To make result less than 1']},{q:'When does P(A\u222aB) = P(A)+P(B)?',correct:'When A and B are mutually exclusive',wrong:['When A and B are independent','Always']}]},
    {id:'cond-prob',action:'Conditional Probability P(A|B)',tier:'core',dom:'probability',
      hint:'Joint probability divided by the condition',
      explain:'Restrict the sample space to only where the condition is true',
      latex:'P(A|B) = \\frac{P(A \\cap B)}{P(B)}',
      blanks:[{latex:'P(A|B) = \\frac{P(A \\cap B)}{\\boxed{\\,?\\,}}',answer:'P(B)',choices:['P(B)','P(A)','P(A\\cup B)']}],
      subconcepts:[{q:'What does "given B" mean?',correct:'Restrict sample space to only B outcomes',wrong:['B happens after A','B causes A']},{q:'If P(A|B)=P(A), what does that mean?',correct:'A and B are independent',wrong:['A and B are mutually exclusive','A always happens']},{q:'Why is P(B) in the denominator?',correct:'It becomes the new total probability',wrong:['To normalize A','Because B is always larger']}]},

    // ══ II. DISCRETE RANDOM VARIABLES ══
    {id:'rv-mean',action:'Expected Value of a Random Variable (\u03bc)',tier:'core',dom:'distributions',
      hint:'Each value times its probability, summed',
      explain:'Expected value — each outcome weighted by how likely it is',
      latex:'\\mu_X = \\sum x_i \\cdot P(x_i)',
      blanks:[{latex:'\\mu_X = \\sum x_i \\cdot \\boxed{\\,?\\,}',answer:'P(xi)',choices:['P(x_i)','x_i','n']}],
      subconcepts:[{q:'What does P(xi) represent?',correct:'The probability of outcome xi',wrong:['The percentile of xi','The frequency of xi']},{q:'Why multiply each xi by P(xi)?',correct:'To weight outcomes by likelihood',wrong:['To normalize values','To find the median']},{q:'What is another name for \u03bcX?',correct:'Expected value E(X)',wrong:['Standard deviation','Mode']}]},
    {id:'rv-sd',action:'Spread of a Random Variable (\u03c3)',tier:'regular',dom:'distributions',
      hint:'Square root of variance: weighted squared deviations',
      explain:'How far outcomes typically fall from the expected value, probability-weighted',
      latex:'\\sigma_X = \\sqrt{\\sum(x_i - \\mu_X)^2 \\cdot P(x_i)}',
      blanks:[{latex:'\\sigma_X = \\sqrt{\\sum(x_i - \\boxed{\\,?\\,})^2 \\cdot P(x_i)}',answer:'mu_X',choices:['\\mu_X','\\bar{x}','0']}],
      subconcepts:[{q:'Why square (xi - \u03bc)\u00b2?',correct:'Prevents positive/negative canceling',wrong:['To make all values integers','To amplify outliers']},{q:'What role does P(xi) play?',correct:'Weights each squared deviation by probability',wrong:['Normalizes the variance','Converts to percentage']},{q:'Why the square root at the end?',correct:'To return to original units of X',wrong:['To reduce the value','To find the mean deviation']}]},

    // ══ II. BINOMIAL ══
    {id:'binom-pmf',action:'Binomial Probability Formula',tier:'regular',dom:'distributions',
      hint:'n choose x \u00b7 p^x \u00b7 (1-p)^(n-x)',
      explain:'Exactly x successes: choose which trials succeed, then multiply probabilities',
      latex:'P(X=x) = \\binom{n}{x}\\, p^x (1-p)^{n-x}',
      blanks:[{latex:'P(X=x) = \\binom{n}{x}\\, p^x\\, \\boxed{\\,?\\,}^{n-x}',answer:'(1-p)',choices:['(1-p)','p','q^2']}],
      subconcepts:[{q:'What does C(n,x) count?',correct:'Ways to choose which x trials succeed',wrong:['Probability of x successes','The number of trials']},{q:'Why exponent (n-x) on (1-p)?',correct:'Remaining trials must all be failures',wrong:['To balance the equation','To calculate variance']},{q:'What are the BINS conditions?',correct:'Binary, Independent, fixed N, Same p',wrong:['Large sample, Normal, Random','Paired, Equal variance, Normal']}]},
    {id:'binom-mean',action:'Mean of Binomial Distribution (\u03bc)',tier:'core',dom:'distributions',
      hint:'n times p \u2014 expected successes',
      explain:'Expected successes = trials times success probability',
      latex:'\\mu_X = np',
      blanks:[{latex:'\\mu_X = n \\cdot \\boxed{\\,?\\,}',answer:'p',choices:['p','q','\\mu']}],
      subconcepts:[{q:'Why is \u03bc=np intuitive?',correct:'Expected successes = trials \u00d7 success rate',wrong:['Because variance=np','Because median=np']},{q:'If n=100 and p=0.3, what is \u03bc?',correct:'30, because μ = np = 100 × 0.3',wrong:['70','3']},{q:'What happens to \u03bc as p increases?',correct:'\u03bc increases proportionally',wrong:['\u03bc stays the same','\u03bc decreases']}]},
    {id:'binom-sd',action:'Standard Deviation of Binomial (\u03c3)',tier:'core',dom:'distributions',
      hint:'Square root of n\u00b7p\u00b7(1-p)',
      explain:'Variability is maximized when p = 0.5 (maximum uncertainty)',
      latex:'\\sigma_X = \\sqrt{np(1-p)}',
      blanks:[{latex:'\\sigma_X = \\sqrt{np\\cdot\\boxed{\\,?\\,}}',answer:'(1-p)',choices:['(1-p)','p','n']}],
      subconcepts:[{q:'Why does p(1-p) appear?',correct:'Variability is largest when p=0.5',wrong:['It calculates the mean','It measures skewness']},{q:'What does n contribute to \u03c3?',correct:'More trials increase total variability',wrong:['More trials decrease variability','n has no effect']},{q:'What does the square root do?',correct:'Converts variance back to original units',wrong:['Squares the units','Makes the distribution symmetric']}]},

    // ══ II. GEOMETRIC ══
    {id:'geom-pmf',action:'Geometric Probability Formula',tier:'regular',dom:'distributions',
      hint:'Fail (x-1) times, then succeed once',
      explain:'All failures first, then one success — order matters',
      latex:'P(X=x) = (1-p)^{x-1} \\cdot p',
      blanks:[{latex:'P(X=x) = (1-p)^{\\boxed{\\,?\\,}} \\cdot p',answer:'x-1',choices:['x-1','x','x+1']}],
      subconcepts:[{q:'Why exponent x-1 on (1-p)?',correct:'Need exactly x-1 failures before first success',wrong:['Need x failures total','To count all outcomes']},{q:'In Algebra 2, what does the geometric random variable X count?',correct:'Number of trials until (and including) first success',wrong:['Successes in n trials','Number of failures before first success']},{q:'How is this different from binomial?',correct:'No fixed number of trials',wrong:['Different probability formula','Requires p>0.5']}]},
    {id:'geom-mean',action:'Mean of Geometric Distribution (\u03bc)',tier:'core',dom:'distributions',
      hint:'Expected trials until first success',
      explain:'Lower success probability means more trials needed on average',
      latex:'\\mu_X = \\frac{1}{p}',
      blanks:[{latex:'\\mu_X = \\frac{1}{\\boxed{\\,?\\,}}',answer:'p',choices:['p','1-p','n']}],
      subconcepts:[{q:'Why is \u03bc = 1/p?',correct:'Lower p means more trials needed on average',wrong:['Because p is always less than 1','To match binomial mean']},{q:'If p=0.25, expected trials?',correct:'4 trials, because μ = 1/p = 1/0.25',wrong:['0.25','25']},{q:'What happens to \u03bc as p\u21921?',correct:'\u03bc approaches 1 (success almost certain)',wrong:['\u03bc approaches infinity','\u03bc approaches 0']}]},
    {id:'geom-sd',action:'Standard Deviation of Geometric (\u03c3)',tier:'regular',dom:'distributions',
      hint:'\u221a(1-p) divided by p',
      explain:'Spread depends on how rare successes are. Variance form: σ² = (1-p)/p²; take √ to get SD',
      latex:'\\sigma_X = \\frac{\\sqrt{1-p}}{p}',
      blanks:[{latex:'\\sigma_X = \\frac{\\sqrt{1-p}}{\\boxed{\\,?\\,}}',answer:'p',choices:['p','p^2','1-p']},{latex:'\\sigma_X^2 = \\frac{1-p}{\\boxed{\\,?\\,}}',answer:'p^2',choices:['p^2','p','(1-p)^2']}],
      subconcepts:[{q:'Why \u221a(1-p) in the numerator?',correct:'More uncertainty (lower p) increases spread',wrong:['To balance the formula','To normalize variance']},{q:'Why divide by p?',correct:'Rarer successes mean more spread in wait time',wrong:['Because we square the mean','To convert to standard units']},{q:'How does \u03c3 change as p increases?',correct:'\u03c3 decreases (less variation in wait time)',wrong:['\u03c3 increases','\u03c3 stays constant']}]},

    // ══ III. INFERENTIAL — General ══
    {id:'z-test-stat',action:'Standardized z Statistic',tier:'core',dom:'inference',
      hint:'How many standard errors from the parameter?',
      explain:'Distance from the hypothesized value, measured in standard errors',
      latex:'z = \\frac{\\text{statistic} - \\text{parameter}}{SE}',
      blanks:[{latex:'z = \\frac{\\text{statistic} - \\text{parameter}}{\\boxed{\\,?\\,}}',answer:'SE',choices:['SE','\\sigma','s']}],
      subconcepts:[{q:'What is the "statistic" in this formula?',correct:'The sample estimate (like x-bar or p-hat)',wrong:['The population parameter','The critical value']},{q:'What is the "parameter"?',correct:'The hypothesized population value',wrong:['The sample statistic','The standard error']},{q:'What does z measure?',correct:'How many SEs the statistic is from the parameter',wrong:['Probability of H\u2080','The effect size']}]},
    {id:'ci-formula',action:'Confidence Interval (general)',tier:'core',dom:'inference',
      hint:'Point estimate \u00b1 margin of error',
      explain:'Center your estimate, then extend by the margin of error',
      latex:'\\text{statistic} \\pm \\text{critical value} \\times SE',
      blanks:[{latex:'\\text{statistic} \\pm \\text{critical value} \\times \\boxed{\\,?\\,}',answer:'SE',choices:['SE','\\sigma','s']}],
      subconcepts:[{q:'What is the critical value?',correct:'z* or t* from the reference distribution',wrong:['The sample mean','The standard error']},{q:'What does \u00b1 margin of error create?',correct:'A range of plausible parameter values',wrong:['The exact parameter','The p-value']},{q:'What determines interval width?',correct:'Confidence level and sample size',wrong:['Only the sample mean','Only the population parameter']}]},
    {id:'chi-sq',action:'Chi-Square Test Statistic',tier:'core',dom:'chi-square',
      hint:'Sum of (observed - expected)\u00b2 / expected',
      explain:'Compares what you observed to what you expected under H0',
      latex:'\\chi^2 = \\sum\\frac{(O-E)^2}{E}',
      blanks:[{latex:'\\chi^2 = \\sum\\frac{(O-\\boxed{\\,?\\,})^2}{E}',answer:'E',choices:['E','O','n']},{latex:'\\chi^2 = \\sum\\frac{(O-E)^2}{\\boxed{\\,?\\,}}',answer:'E',choices:['E','O','n']}],
      subconcepts:[{q:'What does O represent?',correct:'Observed count from data',wrong:['The overall mean','The expected probability']},{q:'What does E represent?',correct:'Expected count under H\u2080',wrong:['The error term','The effect size']},{q:'Why square (O-E)?',correct:'To make all contributions positive',wrong:['To amplify small differences','Taking |O-E| would work just as well']}]},

    // ══ III. ONE PROPORTION ══
    {id:'phat-mean',action:'Sampling Distribution Mean of p\u0302',tier:'core',dom:'inf-proportions',
      hint:'Mean of sampling dist. equals true proportion',
      explain:'An unbiased estimator — the center of all possible sample proportions',
      latex:'\\mu_{\\hat{p}} = p',
      blanks:[{latex:'\\mu_{\\hat{p}} = \\boxed{\\,?\\,}',answer:'p',choices:['p','\\hat{p}','\\mu']}],
      subconcepts:[{q:'Why does \u03bc_p-hat = p?',correct:'p-hat is an unbiased estimator of p',wrong:['All samples give exactly p','p-hat = p always']},{q:'What is p in this context?',correct:'The true population proportion',wrong:['The sample proportion','Probability of Type I error']},{q:'What distribution does p-hat follow?',correct:'Approximately Normal when the Large Counts condition holds (np \u2265 10 and n(1-p) \u2265 10)',wrong:['Exactly Normal always','Binomial']}]},
    {id:'phat-sd',action:'Sampling Distribution SD of p\u0302',tier:'core',dom:'inf-proportions',
      hint:'sqrt of p(1-p) over n',
      explain:'Larger samples reduce variability — sample size is in the denominator',
      latex:'\\sigma_{\\hat{p}} = \\sqrt{\\frac{p(1-p)}{n}}',
      blanks:[{latex:'\\sigma_{\\hat{p}} = \\sqrt{\\frac{\\boxed{\\,?\\,}(1-p)}{n}}',answer:'p',choices:['p','\\hat{p}','p_0']},{latex:'\\sigma_{\\hat{p}} = \\sqrt{\\frac{p(1-p)}{\\boxed{\\,?\\,}}}',answer:'n',choices:['n','n-1','n+1']}],
      subconcepts:[{q:'What does p(1-p) measure?',correct:'Max variability when p=0.5',wrong:['The mean of the distribution','The sample size effect']},{q:'Why divide by n?',correct:'Larger samples reduce variability of p-hat',wrong:['To match population size','To convert to percentage']},{q:'Why the square root?',correct:'Converting variance to SD units',wrong:['To make value smaller','To normalize distribution']}]},
    {id:'phat-se',action:'Standard Error of p\u0302',tier:'regular',dom:'inf-proportions',
      hint:'Replace p with p-hat in the SD formula',
      explain:'Same structure as SD but uses the sample statistic since p is unknown',
      latex:'s_{\\hat{p}} = \\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n}}',
      blanks:[{latex:'s_{\\hat{p}} = \\sqrt{\\frac{\\boxed{\\,?\\,}(1-\\hat{p})}{n}}',answer:'phat',choices:['\\hat{p}','p','p_0']}],
      subconcepts:[{q:'Why use p-hat instead of p?',correct:'True p is unknown; estimate with p-hat',wrong:['p-hat is always more accurate','To make SE larger']},{q:'When use SE vs SD?',correct:'SE with sample data; SD when p is known',wrong:['They are the same','SE for hypothesis tests only']},{q:'What is SE used for?',correct:'Confidence intervals and test statistics',wrong:['Finding population proportion','Calculating sample size']}]},

    // ══ III. TWO PROPORTIONS ══
    {id:'diff-p-sd',action:'SD of Difference in Proportions',tier:'regular',dom:'inf-proportions',
      hint:'Add the variances of each proportion, then sqrt',
      explain:'Independent samples — add the variances, then take the square root',
      latex:'\\sigma_{\\hat{p}_1-\\hat{p}_2} = \\sqrt{\\frac{p_1(1-p_1)}{n_1}+\\frac{p_2(1-p_2)}{n_2}}',
      blanks:[{latex:'\\sigma_{\\hat{p}_1-\\hat{p}_2} = \\sqrt{\\frac{p_1(1-p_1)}{n_1}+\\frac{p_2(1-p_2)}{\\boxed{\\,?\\,}}}',answer:'n2',choices:['n_2','n_1','p_2']}],
      subconcepts:[{q:'Why add the two variance terms?',correct:'Independent samples have variances that add',wrong:['To double sample size','Proportions always add']},{q:'Why separate n\u2081 and n\u2082?',correct:'Two samples can have different sizes',wrong:['To create more df','Groups must be unequal']},{q:'What does this SD describe?',correct:'Variability of p-hat1 minus p-hat2 across samples',wrong:['SD of each proportion','The effect size']}]},
    {id:'diff-p-se',action:'Standard Error of Difference in Proportions',tier:'power',dom:'inf-proportions',
      hint:'Plug in sample proportions for each group',
      explain:'For inference, plug in sample proportions instead of parameters',
      latex:'s_{\\hat{p}_1-\\hat{p}_2} = \\sqrt{\\frac{\\hat{p}_1(1-\\hat{p}_1)}{n_1}+\\frac{\\hat{p}_2(1-\\hat{p}_2)}{n_2}}',
      blanks:[{latex:'s_{\\hat{p}_1-\\hat{p}_2} = \\sqrt{\\frac{\\boxed{\\,?\\,}(1-\\hat{p}_1)}{n_1}+\\frac{\\hat{p}_2(1-\\hat{p}_2)}{n_2}}',answer:'phat1',choices:['\\hat{p}_1','p_1','\\hat{p}_c']}],
      subconcepts:[{q:'Why plug in p-hat1 and p-hat2 separately?',correct:'Each group estimates its own proportion',wrong:['They must be different','To make SE larger']},{q:'When use this SE vs pooled?',correct:'For confidence intervals (not H\u2080 tests)',wrong:['For all hypothesis tests','When samples are dependent']},{q:'What assumption is required?',correct:'Independent random samples',wrong:['Equal sample sizes','Equal proportions']}]},
    {id:'pooled-se',action:'Pooled Standard Error for Two Proportions',tier:'power',dom:'inf-proportions',
      hint:'p-hat-c = (X1+X2)/(n1+n2), then factor out',
      explain:'Under H0 both groups share the same p, so pool the data',
      latex:'s_{\\hat{p}_1-\\hat{p}_2} = \\sqrt{\\hat{p}_c(1-\\hat{p}_c)\\!\\left(\\frac{1}{n_1}+\\frac{1}{n_2}\\right)}',
      blanks:[{latex:'s_{\\hat{p}_1-\\hat{p}_2} = \\sqrt{\\boxed{\\,?\\,}(1-\\hat{p}_c)\\!\\left(\\frac{1}{n_1}+\\frac{1}{n_2}\\right)}',answer:'pc',choices:['\\hat{p}_c','\\hat{p}_1','p_1']}],
      subconcepts:[{q:'What is p-hat-c?',correct:'Combined proportion: (X\u2081+X\u2082)/(n\u2081+n\u2082)',wrong:['Average of p-hat1 and p-hat2','The larger proportion']},{q:'Why pool under H\u2080?',correct:'H\u2080 assumes p\u2081=p\u2082, so use shared estimate',wrong:['To increase sample size','Pooling always reduces error']},{q:'Why factor out p-hat-c(1-p-hat-c)?',correct:'Same proportion applies to both groups under H\u2080',wrong:['To simplify algebra only','Groups are dependent']}]},

    // ══ III. ONE MEAN ══
    {id:'xbar-mean',action:'Sampling Distribution Mean of x\u0305',tier:'core',dom:'inf-means',
      hint:'Mean of x-bar equals the population mean',
      explain:'Sample means center on the true population mean',
      latex:'\\mu_{\\bar{x}} = \\mu',
      blanks:[{latex:'\\mu_{\\bar{x}} = \\boxed{\\,?\\,}',answer:'mu',choices:['\\mu','\\bar{x}','\\sigma']}],
      subconcepts:[{q:'Why does \u03bc_x-bar = \u03bc?',correct:'x-bar is an unbiased estimator of \u03bc',wrong:['Every sample mean equals \u03bc','Because n is always large']},{q:'What does this tell us about sampling?',correct:'Sample means center on the true population mean',wrong:['Every sample mean is close to \u03bc','Distribution is always Normal']},{q:'Does this require normality?',correct:'No \u2014 holds for any population distribution',wrong:['Yes, only for Normal populations','Only if n>30']}]},
    {id:'xbar-sd',action:'Sampling Distribution SD of x\u0305',tier:'core',dom:'inf-means',
      hint:'\u03c3 divided by square root of n',
      explain:'More data points average out variation — divided by root n',
      latex:'\\sigma_{\\bar{x}} = \\frac{\\sigma}{\\sqrt{n}}',
      blanks:[{latex:'\\sigma_{\\bar{x}} = \\frac{\\boxed{\\,?\\,}}{\\sqrt{n}}',answer:'sigma',choices:['\\sigma','s','\\mu']}],
      subconcepts:[{q:'Why divide \u03c3 by \u221an?',correct:'Averaging reduces variability by factor \u221an',wrong:['To convert to standard units','Because \u03c3 is for individuals']},{q:'What happens to \u03c3_x-bar as n increases?',correct:'Decreases (more precise estimates)',wrong:['Increases','Stays the same']},{q:'What is \u03c3 in this formula?',correct:'The population standard deviation',wrong:['The sample SD','The standard error']}]},
    {id:'xbar-se',action:'Standard Error of x\u0305',tier:'regular',dom:'inf-means',
      hint:'Use s (sample SD) when \u03c3 is unknown',
      explain:'Uses s because population sigma is almost never known in practice',
      latex:'s_{\\bar{x}} = \\frac{s}{\\sqrt{n}}',
      blanks:[{latex:'s_{\\bar{x}} = \\frac{\\boxed{\\,?\\,}}{\\sqrt{n}}',answer:'s',choices:['s','\\sigma','\\mu']}],
      subconcepts:[{q:'Why use s instead of \u03c3?',correct:'Population \u03c3 is almost never known',wrong:['s is always larger','To get a t-distribution']},{q:'What distribution do we use with SE?',correct:'t-distribution (not z)',wrong:['Standard Normal z','Chi-square']},{q:'How many df does the t have?',correct:'n - 1',wrong:['n','n - 2']}]},

    // ══ III. TWO MEANS ══
    {id:'diff-x-sd',action:'SD of Difference in Means',tier:'regular',dom:'inf-means',
      hint:'Add the variances, then square root',
      explain:'Independent samples — variances add, then take the square root',
      latex:'\\sigma_{\\bar{x}_1-\\bar{x}_2} = \\sqrt{\\frac{\\sigma_1^2}{n_1}+\\frac{\\sigma_2^2}{n_2}}',
      blanks:[{latex:'\\sigma_{\\bar{x}_1-\\bar{x}_2} = \\sqrt{\\frac{\\boxed{\\,?\\,}}{n_1}+\\frac{\\sigma_2^2}{n_2}}',answer:'sigma1^2',choices:['\\sigma_1^2','s_1^2','\\sigma_1']}],
      subconcepts:[{q:'Why add \u03c3\u2081\u00b2/n\u2081 and \u03c3\u2082\u00b2/n\u2082?',correct:'Variances of independent quantities add',wrong:['To account for difference in means','Standard deviations add']},{q:'What does this assume?',correct:'The two samples are independent',wrong:['Populations are Normal','Sample sizes are equal']},{q:'Why use \u03c3\u00b2 not \u03c3?',correct:'Variances add for independent variables; SDs do not',wrong:['To make formula easier','Variance is always preferred']}]},
    {id:'diff-x-se',action:'Standard Error of Difference in Means',tier:'power',dom:'inf-means',
      hint:'Use sample variances s\u00b2 for each group',
      explain:'Sample variances replace population variances for real-world inference',
      latex:'s_{\\bar{x}_1-\\bar{x}_2} = \\sqrt{\\frac{s_1^2}{n_1}+\\frac{s_2^2}{n_2}}',
      blanks:[{latex:'s_{\\bar{x}_1-\\bar{x}_2} = \\sqrt{\\frac{\\boxed{\\,?\\,}}{n_1}+\\frac{s_2^2}{n_2}}',answer:'s1^2',choices:['s_1^2','\\sigma_1^2','s_1']}],
      subconcepts:[{q:'Why replace \u03c3 with s?',correct:'Population SDs are unknown in practice',wrong:['s is more accurate','To use a z-distribution']},{q:'What distribution results?',correct:'t-distribution (with complex df)',wrong:['Standard Normal','Chi-square']},{q:'Can n\u2081 and n\u2082 be different?',correct:'Yes \u2014 unequal sample sizes are fine',wrong:['No, must be equal','Only if variances are equal']}]},

    // ══ III. REGRESSION SLOPE ══
    {id:'slope-mean',action:'Sampling Distribution Mean of Slope b',tier:'regular',dom:'regression',
      hint:'Mean of slope sampling dist. = true slope \u03b2',
      explain:'The sampling distribution of slopes centers on the true population slope',
      latex:'\\mu_b = \\beta',
      blanks:[{latex:'\\mu_b = \\boxed{\\,?\\,}',answer:'beta',choices:['\\beta','b','\\mu']}],
      subconcepts:[{q:'What is \u03b2 in this context?',correct:'The true population slope',wrong:['The sample slope','The y-intercept']},{q:'Why does \u03bc_b = \u03b2?',correct:'b is an unbiased estimator of the true slope',wrong:['Regression always finds true slope','Residuals sum to zero']},{q:'What is sampling distribution of b?',correct:'Distribution of slopes from all possible samples',wrong:['The range of the data','The residual distribution']}]},
    {id:'slope-sd',action:'SD of Regression Slope b',tier:'power',dom:'regression',
      hint:'\u03c3 over (\u03c3\u2093 \u00b7 \u221an), where \u03c3\u2093 uses n not n-1',
      explain:'Less residual noise and more x-spread both give more precise slopes',
      latex:'\\sigma_b = \\frac{\\sigma}{\\sigma_x\\sqrt{n}}',
      blanks:[{latex:'\\sigma_b = \\frac{\\sigma}{\\boxed{\\,?\\,}\\sqrt{n}}',answer:'sigma_x',choices:['\\sigma_x','s_x','\\sigma']}],
      subconcepts:[{q:'What does \u03c3 in the numerator represent?',correct:'SD of residuals (noise around the line)',wrong:['SD of x-values','SD of y-values']},{q:'Why \u03c3x (not sx) in denominator?',correct:'\u03c3x uses population formula (divides by n, not n-1)',wrong:['They are the same thing','sx is only for means']},{q:'Why does \u221an appear?',correct:'More observations \u2192 more precise slope',wrong:['To convert to standard units','Because df=n']}]},
    {id:'slope-se',action:'Standard Error of Regression Slope b',tier:'power',dom:'regression',
      hint:'s over (s\u2093 \u00b7 \u221a(n-1)), s = residual SD',
      explain:'Residual SD replaces sigma; df adjusted for estimating the line',
      latex:'s_b = \\frac{s}{s_x\\sqrt{n-1}}',
      blanks:[{latex:'s_b = \\frac{s}{s_x\\sqrt{\\boxed{\\,?\\,}}}',answer:'n-1',choices:['n-1','n','n-2']}],
      subconcepts:[{q:'Why use s instead of \u03c3?',correct:'True residual SD is unknown; s estimates it',wrong:['s is always smaller','To use a z-test']},{q:'Why \u221a(n-1) instead of \u221an?',correct:'Degrees of freedom adjustment',wrong:['We lose 1 df for the mean','To match t-distribution exactly']},{q:'What is s in this formula?',correct:'The residual standard deviation',wrong:['Sample SD of y','Sample SD of x']}]},
    {id:'resid-s',action:'Residual Standard Deviation (s)',tier:'power',dom:'regression',
      hint:'Like regular SD but df = n-2 for regression',
      explain:'Measures typical prediction error; loses 2 df for estimating a and b',
      latex:'s = \\sqrt{\\frac{\\sum(y_i - \\hat{y}_i)^2}{n-2}}',
      blanks:[{latex:'s = \\sqrt{\\frac{\\sum(y_i - \\hat{y}_i)^2}{\\boxed{\\,?\\,}}}',answer:'n-2',choices:['n-2','n-1','n']}],
      subconcepts:[{q:'What are residuals (yi - y-hat)?',correct:'Differences between observed and predicted y',wrong:['Differences between x and y','Differences between samples']},{q:'Why n-2 in the denominator?',correct:'Lose 2 df for estimating both a and b',wrong:['There are 2 variables','To match chi-square df']},{q:'What does s measure?',correct:'Typical size of prediction errors',wrong:['The slope','The correlation strength']}]},

    // ══ COMBINATION / APPLICATION ══
    {id:'one-prop-z',action:'One-proportion z statistic',tier:'regular',dom:'inf-proportions',
      hint:'Plug p\u2080 (null value) into SE, not p-hat',
      explain:'Compare observed proportion to null value using null SE',
      latex:'z = \\frac{\\hat{p} - p_0}{\\sqrt{\\frac{p_0(1-p_0)}{n}}}',
      blanks:[{latex:'z = \\frac{\\hat{p} - \\boxed{\\,?\\,}}{\\sqrt{\\frac{p_0(1-p_0)}{n}}}',answer:'p0',choices:['p_0','\\hat{p}','p']}],
      subconcepts:[{q:'Why use p\u2080 in SE (not p-hat)?',correct:'Under H\u2080 we assume p=p\u2080 is true',wrong:['p\u2080 is more accurate','To make z larger']},{q:'What does p-hat - p\u2080 measure?',correct:'How far sample is from hypothesized value',wrong:['The effect size','The margin of error']},{q:'What conditions are needed?',correct:'Random sample, np\u2080\u226510, n(1-p\u2080)\u226510',wrong:['n>30 only','Normal population required']}]},
    {id:'one-mean-t',action:'One-sample t statistic',tier:'regular',dom:'inf-means',
      hint:'x-bar minus hypothesized mean, over SE',
      explain:'How far is the sample mean from the hypothesized value, in SE units?',
      latex:'t = \\frac{\\bar{x} - \\mu_0}{s/\\sqrt{n}}',
      blanks:[{latex:'t = \\frac{\\bar{x} - \\boxed{\\,?\\,}}{s/\\sqrt{n}}',answer:'mu0',choices:['\\mu_0','\\bar{x}','\\mu']}],
      subconcepts:[{q:'Why use t instead of z?',correct:'Because we use s instead of \u03c3',wrong:['Because sample is small','Population is not Normal']},{q:'What does \u03bc\u2080 represent?',correct:'Hypothesized population mean under H\u2080',wrong:['The sample mean','The true population mean']},{q:'What is the df?',correct:'n - 1',wrong:['n','n - 2']}]},
    {id:'two-prop-z',action:'Two-proportion z statistic',tier:'power',dom:'inf-proportions',
      hint:'Difference in p-hat over pooled SE',
      explain:'Difference in sample proportions, standardized by pooled variability',
      latex:'z = \\frac{\\hat{p}_1 - \\hat{p}_2}{\\sqrt{\\hat{p}_c(1-\\hat{p}_c)(\\frac{1}{n_1}+\\frac{1}{n_2})}}',
      blanks:[{latex:'z = \\frac{\\hat{p}_1 - \\hat{p}_2}{\\sqrt{\\boxed{\\,?\\,}(1-\\hat{p}_c)(\\frac{1}{n_1}+\\frac{1}{n_2})}}',answer:'pc',choices:['\\hat{p}_c','\\hat{p}_1','p_1']}],
      subconcepts:[{q:'Why pool the proportions?',correct:'Under H\u2080: p\u2081=p\u2082, both share one p',wrong:['To increase sample size','Separate SEs are wrong']},{q:'What does the numerator measure?',correct:'Observed difference between sample proportions',wrong:['True difference','The margin of error']},{q:'When do we use this test?',correct:'Testing H\u2080: p\u2081=p\u2082 with independent samples',wrong:['For paired proportions','When proportions are known']}]},
    {id:'two-mean-t',action:'Two-sample t statistic',tier:'power',dom:'inf-means',
      hint:'Difference in means over SE of the difference',
      explain:'Difference in sample means, standardized by combined SE',
      latex:'t = \\frac{\\bar{x}_1 - \\bar{x}_2}{\\sqrt{\\frac{s_1^2}{n_1}+\\frac{s_2^2}{n_2}}}',
      blanks:[{latex:'t = \\frac{\\bar{x}_1 - \\bar{x}_2}{\\sqrt{\\frac{\\boxed{\\,?\\,}}{n_1}+\\frac{s_2^2}{n_2}}}',answer:'s1^2',choices:['s_1^2','\\sigma_1^2','s_1']}],
      subconcepts:[{q:'Why add s\u2081\u00b2/n\u2081 and s\u2082\u00b2/n\u2082?',correct:'Variances of independent estimates add',wrong:['Standard deviations add','To double precision']},{q:'What distribution does this follow?',correct:'t-distribution (with Welch df)',wrong:['Standard Normal','Chi-square']},{q:'What does numerator measure?',correct:'Difference between two sample means',wrong:['The pooled mean','The effect size']}]},
    {id:'slope-t',action:'Regression slope t statistic',tier:'power',dom:'regression',
      hint:'b over SE of b (testing H0: slope = 0)',
      explain:'Is the observed slope far enough from zero to conclude a real linear relationship?',
      latex:'t = \\frac{b}{s_b}',
      blanks:[{latex:'t = \\frac{b}{\\boxed{\\,?\\,}}',answer:'s_b',choices:['s_b','s','\\sigma_b']}],
      subconcepts:[{q:'Why is the hypothesized slope 0 in Algebra 2?',correct:'H\u2080 says no linear relationship exists',wrong:['Because slope is always positive','The sample slope b equals 0']},{q:'What does s_b measure?',correct:'How much sample slope varies across samples',wrong:['Residual SD','The correlation']},{q:'What conditions are needed?',correct:'Linear, Independent, Normal residuals, Equal variance',wrong:['Large sample only','Random assignment required']}]},
    {id:'zscore',action:'Z-Score (SDs from mean)',tier:'support',dom:'descriptive',
      hint:'How many SDs from the mean',
      explain:'Standardizes any value to a common scale',
      latex:'z = \\frac{x - \\mu}{\\sigma}',
      blanks:[{latex:'z = \\frac{x - \\mu}{\\boxed{\\,?\\,}}',answer:'sigma',choices:['\\sigma','s','\\mu']}],
      subconcepts:[
        {q:'What does x represent?',correct:'The individual data value',wrong:['The mean','The standard deviation']},
        {q:'Why subtract mu?',correct:'To measure distance from the center',wrong:['To normalize the value','To find the variance']},
        {q:'Why divide by sigma?',correct:'To express distance in standard deviation units',wrong:['To make it positive','To find the percentile']}
      ]},
    {id:'iqr',action:'Interquartile Range (Q3 \u2212 Q1)',tier:'support',dom:'descriptive',
      hint:'Spread of the middle 50%',
      explain:'Resistant measure of variability based on quartiles',
      latex:'IQR = Q_3 - Q_1',
      blanks:[{latex:'IQR = Q_3 - \\boxed{\\,?\\,}',answer:'Q1',choices:['Q_1','Q_2','\\bar{x}']}],
      subconcepts:[
        {q:'What does Q1 represent?',correct:'The 25th percentile',wrong:['The minimum','The median']},
        {q:'Why is IQR called resistant?',correct:'Not affected by outliers or extreme values',wrong:['It uses all data points','It is always positive']},
        {q:'What percentage of data falls within the IQR?',correct:'50% (the middle half)',wrong:['68%','95%']}
      ]},
    {id:'outlier-iqr',action:'Outlier Rule (IQR)',tier:'support',dom:'descriptive',
      hint:'Beyond 1.5 IQR from Q1 or Q3',
      explain:'Uses quartiles to flag unusually extreme values',
      latex:'\\text{Outlier if } x > Q_3 + 1.5 \\cdot IQR \\text{ or } x < Q_1 - 1.5 \\cdot IQR',
      blanks:[{latex:'x > Q_3 + \\boxed{\\,?\\,} \\cdot IQR',answer:'1.5',choices:['1.5','2','1']}],
      subconcepts:[
        {q:'Why 1.5 as the multiplier?',correct:'Standard convention that balances sensitivity and specificity',wrong:['It equals one standard deviation','It is derived from the normal distribution']},
        {q:'Why use Q1 and Q3 instead of mean?',correct:'Quartiles are resistant to the outliers being detected',wrong:['They are easier to calculate','The mean is always zero']},
        {q:'Can a dataset have no outliers?',correct:'Yes, if all values are within the fences',wrong:['No, every dataset has outliers','Only if the data is normal']}
      ]},
    {id:'empirical-rule',action:'Empirical Rule (68-95-99.7)',tier:'support',dom:'descriptive',
      hint:'Normal distribution percentages by SD',
      explain:'Quick approximation for normal distributions without a table',
      latex:'68\\%\\text{ within }1\\sigma,\\; 95\\%\\text{ within }2\\sigma,\\; 99.7\\%\\text{ within }3\\sigma',
      blanks:[{latex:'\\boxed{\\,?\\,}\\%\\text{ within }2\\sigma',answer:'95',choices:['95','68','99.7']}],
      subconcepts:[
        {q:'What shape must the distribution be?',correct:'Approximately normal (bell-shaped)',wrong:['Any shape','Skewed right']},
        {q:'What is the mean in the context of this rule?',correct:'The center of the distribution',wrong:['Always zero','The median']},
        {q:'If mean=100 and SD=15, about 95% fall between?',correct:'70 and 130, which is mean ± 2 SD',wrong:['85 and 115','55 and 145']}
      ]},
    {id:'residual',action:'Residual (y \u2212 \u0177)',tier:'support',dom:'descriptive',
      hint:'Observed minus predicted',
      explain:'Measures prediction error for each data point',
      latex:'\\text{residual} = y - \\hat{y}',
      blanks:[{latex:'\\text{residual} = y - \\boxed{\\,?\\,}',answer:'\\hat{y}',choices:['\\hat{y}','\\bar{y}','y']}],
      subconcepts:[
        {q:'What does a positive residual mean?',correct:'The model underpredicted (actual > predicted)',wrong:['The model overpredicted','The point is an outlier']},
        {q:'What should the sum of all residuals equal for LSRL?',correct:'Zero (residuals balance out by least squares)',wrong:['The mean of y','One']},
        {q:'What should a residual plot look like for a good model?',correct:'Random scatter with no pattern',wrong:['A straight line','A curved pattern']}
      ]},
    {id:'r-squared',action:'Coefficient of Determination',tier:'support',dom:'descriptive',
      hint:'Proportion of variation explained by the model',
      explain:'Tells how well x predicts y in the regression',
      latex:'r^2 = \\text{proportion of variation in } y \\text{ explained by } x',
      blanks:[{latex:'r^2 = (\\boxed{\\,?\\,})^2',answer:'r',choices:['r','b','s']}],
      subconcepts:[
        {q:'If r squared = 0.81, what does this mean?',correct:'81% of variation in y is explained by x',wrong:['The correlation is 0.81','81% of predictions are correct']},
        {q:'What is the range of r squared?',correct:'0 to 1 (0% to 100%)',wrong:['-1 to 1','0 to infinity']},
        {q:'If r = -0.9, what is r squared?',correct:'0.81, because (−0.9)² = 0.81',wrong:['-0.81','0.9']}
      ]},
    {id:'y-intercept',action:'Y-Intercept of Regression Line',tier:'support',dom:'descriptive',
      hint:'Derived from the point of means',
      explain:'Predicted y when x = 0',
      latex:'a = \\bar{y} - b\\bar{x}',
      blanks:[{latex:'a = \\bar{y} - \\boxed{\\,?\\,} \\cdot \\bar{x}',answer:'b',choices:['b','r','a']}],
      subconcepts:[
        {q:'Why does this formula use x-bar and y-bar?',correct:'The regression line must pass through the point of means',wrong:['To center the data','To remove outliers']},
        {q:'What does a represent in y-hat = a + bx?',correct:'The predicted y when x equals zero',wrong:['The slope','The correlation']},
        {q:'Is the y-intercept always meaningful?',correct:'No, only if x = 0 is within the range of the data',wrong:['Yes, always','Only for positive slopes']}
      ]},
    {id:'complement',action:'Complement P(not A) = 1 \u2212 P(A)',tier:'support',dom:'probability',
      hint:'P(not E) = 1 minus P(E)',
      explain:'Every event either happens or does not',
      latex:'P(E^C) = 1 - P(E)',
      blanks:[{latex:'P(E^C) = \\boxed{\\,?\\,} - P(E)',answer:'1',choices:['1','0','P(E)']}],
      subconcepts:[
        {q:'What does E-complement mean?',correct:'The event E does NOT occur',wrong:['E occurs twice','The opposite event']},
        {q:'If P(rain) = 0.3, what is P(no rain)?',correct:'0.7, because P(Aᶜ) = 1 − P(A)',wrong:['0.3','1.3']},
        {q:'When is the complement rule most useful?',correct:'When P(at least one) is hard to compute directly',wrong:['Only for independent events','Only for mutually exclusive events']}
      ]},
    {id:'mult-rule',action:'General Multiplication Rule',tier:'support',dom:'probability',
      hint:'P(A and B) = P(A) times P(B given A)',
      explain:'Accounts for how A changes the probability of B',
      latex:'P(A \\cap B) = P(A) \\cdot P(B|A)',
      blanks:[{latex:'P(A \\cap B) = P(A) \\cdot \\boxed{\\,?\\,}',answer:'P(B|A)',choices:['P(B|A)','P(B)','P(A|B)']}],
      subconcepts:[
        {q:'When does P(B|A) differ from P(B)?',correct:'When A and B are not independent',wrong:['Never','Always']},
        {q:'How does this relate to conditional probability?',correct:'It is a rearrangement of P(A|B) = P(A and B)/P(B)',wrong:['They are unrelated','It only works for independent events']},
        {q:'If events ARE independent, what simplifies?',correct:'P(B|A) = P(B), so P(A and B) = P(A) times P(B)',wrong:['P(A and B) = 0','P(A and B) = P(A) + P(B)']}
      ]},
    {id:'mult-independent',action:'Multiplication Rule (Independent)',tier:'support',dom:'probability',
      hint:'P(A and B) = P(A) times P(B)',
      explain:'Simplified version when events do not affect each other',
      latex:'P(A \\cap B) = P(A) \\cdot P(B) \\quad \\text{(if independent)}',
      blanks:[{latex:'P(A \\cap B) = P(A) \\cdot \\boxed{\\,?\\,}',answer:'P(B)',choices:['P(B)','P(B|A)','P(A \\cup B)']}],
      subconcepts:[
        {q:'What does independence mean here?',correct:'Knowing A occurred does not change the probability of B',wrong:['A and B cannot both happen','A causes B']},
        {q:'How do you check if events are independent?',correct:'P(A|B) = P(A), or P(A and B) = P(A) times P(B)',wrong:['P(A) + P(B) = 1','They are mutually exclusive']},
        {q:'Are mutually exclusive events independent?',correct:'No - if A happens, B cannot (P(B|A) = 0, not P(B))',wrong:['Yes, always','Only if P(A) = P(B)']}
      ]},
    {id:'lincomb-mean',action:'Mean of Linear Combination',tier:'support',dom:'distributions',
      hint:'Mean of aX+bY = a times mean X + b times mean Y',
      explain:'Means combine linearly regardless of independence',
      latex:'\\mu_{aX+bY} = a\\mu_X + b\\mu_Y',
      blanks:[{latex:'\\mu_{aX+bY} = a\\mu_X + \\boxed{\\,?\\,}\\mu_Y',answer:'b',choices:['b','a','1']}],
      subconcepts:[
        {q:'Does this require X and Y to be independent?',correct:'No, means always combine linearly',wrong:['Yes, independence required','Only for normal variables']},
        {q:'For X-bar1 minus X-bar2, what are a and b?',correct:'a = 1, b = -1',wrong:['a = 1, b = 1','a = 0, b = 1']},
        {q:'Why is this useful for sampling distributions?',correct:'It lets us find the mean of differences like p-hat1 minus p-hat2',wrong:['It replaces the CLT','It only works for sums']}
      ]},
    {id:'lincomb-var',action:'Variance of Linear Combination',tier:'support',dom:'distributions',
      hint:'Variances add (with squared coefficients) for independent variables',
      explain:'Key reason why we add variances for differences, not subtract',
      latex:'\\text{Var}(aX+bY) = a^2\\sigma_X^2 + b^2\\sigma_Y^2 \\quad \\text{(independent)}',
      blanks:[{latex:'\\text{Var}(aX+bY) = a^2\\sigma_X^2 + \\boxed{\\,?\\,}\\sigma_Y^2',answer:'b^2',choices:['b^2','b','-b^2']}],
      subconcepts:[
        {q:'Why b-squared (not just b)?',correct:'Squaring makes the coefficient positive even for subtraction',wrong:['To match the units','Because variance is always squared']},
        {q:'Why do variances ADD for X minus Y?',correct:'Because (-1) squared = 1, so both terms are positive',wrong:['Variances always subtract for differences','This only works for sums']},
        {q:'Does this require independence?',correct:'Yes, if X and Y are not independent there is a covariance term',wrong:['No, it always works','Only for normal distributions']}
      ]},
    {id:'lintransform',action:'Linear Transform of \u03bc and \u03c3 (Y = a + bX)',tier:'support',dom:'distributions',
      hint:'Adding shifts the mean; multiplying scales both mean and SD',
      explain:'Changing units (like C to F) transforms parameters predictably',
      latex:'Y = a+bX: \\; \\mu_Y = a+b\\mu_X, \\; \\sigma_Y = |b|\\sigma_X',
      blanks:[{latex:'\\sigma_Y = \\boxed{\\,?\\,} \\cdot \\sigma_X',answer:'|b|',choices:['|b|','b','a+b']}],
      subconcepts:[
        {q:'Why does adding a constant NOT change the SD?',correct:'Adding shifts all values equally, spread stays the same',wrong:['It does change the SD','Only for normal data']},
        {q:'Converting inches to cm (multiply by 2.54) does what to SD?',correct:'Multiplies the SD by 2.54',wrong:['Does not change SD','Divides SD by 2.54']},
        {q:'Why absolute value of b?',correct:'SD is always non-negative',wrong:['b is always positive','To handle missing data']}
      ]},
    {id:'expected-twoway',action:'Expected Count (Two-Way Table)',tier:'support',dom:'chi-square',
      hint:'Row total times column total divided by grand total',
      explain:'What we would expect if the variables were independent',
      latex:'E = \\frac{\\text{row total} \\times \\text{column total}}{\\text{grand total}}',
      blanks:[{latex:'E = \\frac{\\text{row total} \\times \\text{column total}}{\\boxed{\\,?\\,}}',answer:'\\text{grand total}',choices:['\\text{grand total}','n','\\text{row total}']}],
      subconcepts:[
        {q:'What assumption does this formula reflect?',correct:'That the row and column variables are independent',wrong:['That the counts are equal','That the data is normal']},
        {q:'Why multiply row by column total?',correct:'Under independence, joint proportion = product of marginal proportions',wrong:['To get the largest possible count','To normalize the table']},
        {q:'What condition must expected counts satisfy?',correct:'All expected counts must be at least 5',wrong:['All must be integers','All must equal observed counts']}
      ]},
    {id:'expected-gof',action:'Expected Count (Goodness of Fit)',tier:'support',dom:'chi-square',
      hint:'Sample size times null proportion',
      explain:'What each category count should be if H0 proportions are correct',
      latex:'E = n \\cdot p_0',
      blanks:[{latex:'E = n \\cdot \\boxed{\\,?\\,}',answer:'p0',choices:['p_0','\\hat{p}','1/k']}],
      subconcepts:[
        {q:'Where does p0 come from?',correct:'The null hypothesis specifies the expected proportions',wrong:['From the sample data','From a normal distribution']},
        {q:'What if H0 says all categories are equally likely with k categories?',correct:'Each expected count is n/k',wrong:['Each is n times k','Each is 1/k']},
        {q:'Why do we need expected counts?',correct:'To compare with observed counts in the chi-square formula',wrong:['To find the p-value directly','To determine the sample size']}
      ]},
    {id:'df-gof',action:'Degrees of Freedom for Goodness-of-Fit',tier:'support',dom:'chi-square',
      hint:'Number of categories minus one',
      explain:'Lose 1 df because proportions must sum to 1',
      latex:'df = k - 1 \\quad \\text{(k = number of categories)}',
      blanks:[{latex:'df = k - \\boxed{\\,?\\,}',answer:'1',choices:['1','2','k']}],
      subconcepts:[
        {q:'Why subtract 1?',correct:'Once k-1 proportions are set, the last is determined (must sum to 1)',wrong:['Because we estimated the mean','Convention']},
        {q:'If there are 5 categories, what is df?',correct:'4, because df = k − 1 = 5 − 1',wrong:['5','3']},
        {q:'How is df used?',correct:'To find the p-value from the chi-square distribution',wrong:['To calculate the test statistic','To determine sample size']}
      ]},
    {id:'df-twoway',action:'Degrees of Freedom for Two-Way Table',tier:'support',dom:'chi-square',
      hint:'(rows minus 1) times (columns minus 1)',
      explain:'Reflects the number of independent cells in the table',
      latex:'df = (r-1)(c-1)',
      blanks:[{latex:'df = (r-1)\\cdot\\boxed{\\,?\\,}',answer:'(c-1)',choices:['(c-1)','c','(r-1)']}],
      subconcepts:[
        {q:'Why (r-1) instead of r?',correct:'Row totals are fixed, so last row is determined',wrong:['We subtract 1 for the mean','There is always one empty row']},
        {q:'A 3x4 table has how many df?',correct:'6 = (3-1)(4-1) = 2 times 3',wrong:['12','11']},
        {q:'Does this apply to GOF tests?',correct:'No, GOF uses k-1 (one-dimensional)',wrong:['Yes, same formula','Only if there are 2 rows']}
      ]},
    {id:'chi-sq-select',action:'Which Chi-Square Test?',tier:'support',dom:'chi-square',
      hint:'GOF = one variable vs claimed distribution. Homogeneity = same variable across populations. Independence = two variables in one population.',
      explain:'All three use the same chi-square formula, but the design and hypotheses differ',
      latex:'\\text{GOF: 1 var, claimed } p_i \\quad | \\quad \\text{Homog: 1 var, multiple pops} \\quad | \\quad \\text{Indep: 2 vars, 1 pop}',
      blanks:[
        {latex:'A researcher compares the distribution of a \\textbf{single categorical variable} across 3 school districts \\to \\boxed{\\,?\\,}',answer:'Homogeneity',choices:['Homogeneity','Independence','Goodness of Fit']},
        {latex:'A survey asks 500 adults about \\textbf{party affiliation} and \\textbf{opinion on a policy} \\to \\boxed{\\,?\\,}',answer:'Independence',choices:['Independence','Homogeneity','Goodness of Fit']}
      ],
      subconcepts:[
        {q:'When do you use a Goodness-of-Fit test?',correct:'One categorical variable compared to a claimed/hypothesized distribution',wrong:['Two categorical variables in one sample','One variable across multiple populations']},
        {q:'What distinguishes homogeneity from independence?',correct:'Homogeneity compares one variable across separate populations; independence tests two variables within one population',wrong:['They use different formulas','Homogeneity requires equal sample sizes']},
        {q:'A bag of candy claims 30% red, 20% blue, 50% green. You count 200 candies. Which test?',correct:'Goodness of Fit - one variable vs a claimed distribution',wrong:['Independence - two variables','Homogeneity - comparing groups']}
      ]},
    {id:'chi-sq-hyp',action:'Chi-Square Hypotheses (H0 and Ha)',tier:'support',dom:'chi-square',
      hint:'H0 always states "no difference" or "fits the claimed distribution." Ha says "at least one differs."',
      explain:'Chi-square tests are always one-sided (right-tail) because chi-square cannot be negative',
      latex:'H_0\\!:\\text{observed fits expected} \\quad H_a\\!:\\text{at least one category differs}',
      blanks:[
        {latex:'\\text{GOF } H_0\\!: \\text{The distribution of [variable] is } \\boxed{\\,?\\,}',answer:'as claimed',choices:['as claimed','uniform','Normal']},
        {latex:'\\text{Independence } H_0\\!: \\text{[var 1] and [var 2] are } \\boxed{\\,?\\,}',answer:'independent',choices:['independent','dependent','equal']}
      ],
      subconcepts:[
        {q:'What does Ha say for a GOF test?',correct:'At least one proportion differs from the claimed value',wrong:['All proportions are different','The distribution is Normal']},
        {q:'Why are chi-square tests always right-tailed?',correct:'Chi-square is always non-negative - large values indicate poor fit',wrong:['Because Ha is always "greater than"','Left-tail is for t-tests only']},
        {q:'For a homogeneity test, what does H0 claim?',correct:'The distribution of the variable is the same across all populations',wrong:['The means are equal','The sample sizes are equal']}
      ]},
    {id:'chi-sq-conditions',action:'Conditions for Chi-Square Inference',tier:'support',dom:'chi-square',
      hint:'Random, Independent (10% condition), Large Counts (all expected >= 5)',
      explain:'Expected counts >= 5 (not observed) ensures the chi-square approximation is valid',
      latex:'\\text{Random sample/experiment} \\quad \\text{Independent (10\\% rule)} \\quad \\text{All } E_i \\geq 5',
      blanks:[
        {latex:'\\text{Large counts condition: All } \\boxed{\\,?\\,} \\text{ counts} \\geq 5',answer:'expected',choices:['expected','observed','total']},
        {latex:'\\text{Independence requires } n < \\boxed{\\,?\\,}',answer:'0.10N',choices:['0.10N','0.05N','N']}
      ],
      subconcepts:[
        {q:'Why must EXPECTED counts (not observed) be at least 5?',correct:'The chi-square approximation breaks down when expected counts are small',wrong:['Observed counts are always larger','To ensure the data is Normal']},
        {q:'A GOF test has one cell with E=3.2. What should you do?',correct:'The large counts condition is not met - results may not be valid',wrong:['Combine categories or collect more data and proceed','Ignore it if other cells are large']},
        {q:'What does the 10% condition ensure for chi-square?',correct:'Sampling without replacement is approximately independent',wrong:['Expected counts are large enough','The sample is representative']}
      ]},
    {id:'chi-sq-conclude',action:'Chi-Square Conclusion Template',tier:'support',dom:'chi-square',
      hint:'Compare p-value to alpha. State in context of the variables and populations.',
      explain:'Never say "accept H0" - say "fail to reject." Always link back to the specific variables.',
      latex:'\\text{Since p-value } [</>] \\; \\alpha\\text{, we [reject/fail to reject] } H_0',
      blanks:[
        {latex:'\\text{p-value} = 0.02,\\; \\alpha = 0.05 \\implies \\boxed{\\,?\\,} H_0',answer:'reject',choices:['reject','fail to reject','accept']},
        {latex:'\\text{p-value} = 0.12,\\; \\alpha = 0.05 \\implies \\boxed{\\,?\\,}',answer:'fail to reject H_0',choices:['fail to reject H_0','reject H_0','accept H_a']}
      ],
      subconcepts:[
        {q:'Why should you never say "accept H0"?',correct:'Failing to reject does not prove H0 true - we just lack evidence against it',wrong:['It is grammatically incorrect','Accepting requires alpha < 0.01']},
        {q:'What must a conclusion in context include?',correct:'Reference to the specific variables and populations in the study',wrong:['The exact p-value','The expected counts table']},
        {q:'After rejecting H0 in a chi-square test, what is a useful follow-up?',correct:'Examine standardized residuals to see which cells drove the result',wrong:['Run a t-test','Increase the sample size and retest']}
      ]},
    {id:'chi-sq-output',action:'Interpreting Chi-Square Output',tier:'support',dom:'chi-square',
      hint:'Computer output gives chi-square, df, and p-value. You supply the context and conclusion.',
      explain:'AP exam often gives output - your job is to verify conditions and state conclusions, not compute chi-square',
      latex:'\\chi^2 = \\text{[value]}, \\quad df = \\text{[value]}, \\quad \\text{p-value} = \\text{[value]}',
      blanks:[
        {latex:'\\chi^2 = 14.2,\\; df = 3 \\implies \\text{the test has } \\boxed{\\,?\\,} \\text{ categories}',answer:'4',choices:['4','3','5']},
        {latex:'\\text{df} = 6 \\text{ from a two-way table with } r=3 \\implies c = \\boxed{\\,?\\,}',answer:'4',choices:['4','3','7']}
      ],
      subconcepts:[
        {q:'Computer output shows chi-square = 8.3, df = 4, p = 0.081. At alpha = 0.05, what do you conclude?',correct:'Fail to reject H0 - not enough evidence that the distribution differs',wrong:['Reject H0 - the result is significant','Cannot determine without expected counts']},
        {q:'Why does the AP exam give you chi-square instead of making you calculate it?',correct:'The test focuses on interpretation and conditions, not arithmetic',wrong:['The formula is too hard to memorize','Students can use calculators']},
        {q:'Output shows a large standardized residual (+3.1) in one cell. What does that mean?',correct:'That cell had far more observed than expected - a major contributor to the chi-square result',wrong:['The test is invalid','That cell should be removed']}
      ]},
    {id:'power',action:'Power (1 \u2212 \u03b2, prob of rejecting false H\u2080)',tier:'support',dom:'inference',
      hint:'Probability of correctly rejecting a false H0',
      explain:'Higher power means better ability to detect real effects',
      latex:'\\text{Power} = 1 - P(\\text{Type II error}) = 1 - \\beta',
      blanks:[{latex:'\\text{Power} = 1 - \\boxed{\\,?\\,}',answer:'beta',choices:['\\beta','\\alpha','p']}],
      subconcepts:[
        {q:'What is a Type II error?',correct:'Failing to reject H0 when H0 is actually false',wrong:['Rejecting H0 when H0 is true','Getting a small p-value']},
        {q:'How can you increase power?',correct:'Increase sample size, increase alpha, or increase effect size',wrong:['Decrease sample size','Use a two-sided test instead of one-sided']},
        {q:'What is the relationship between alpha and power?',correct:'Higher alpha gives higher power (but more Type I error risk)',wrong:['They are the same thing','Higher alpha decreases power']}
      ]},
    {id:'margin-error',action:'Margin of Error (critical value \u00d7 SE)',tier:'support',dom:'inference',
      hint:'Critical value times standard error',
      explain:'Controls the precision of the confidence interval',
      latex:'ME = z^* \\cdot SE \\quad \\text{or} \\quad ME = t^* \\cdot SE',
      blanks:[{latex:'ME = \\boxed{\\,?\\,} \\cdot SE',answer:'z^* \\text{ or } t^*',choices:['z^* \\text{ or } t^*','\\alpha','n']}],
      subconcepts:[
        {q:'What determines whether to use z* or t*?',correct:'z* for proportions (the standard error of p-hat uses p-hat itself, so no population SD estimate is needed); t* for means (we estimate the population SD \u03c3 with sample SD s, which adds uncertainty and requires a t distribution)',wrong:['z* for small samples','t* only when n < 30']},
        {q:'How does increasing confidence level affect ME?',correct:'ME increases (wider interval, more confident)',wrong:['ME decreases','ME stays the same']},
        {q:'How does increasing n affect ME?',correct:'ME decreases (SE gets smaller, more precise)',wrong:['ME increases','No effect']}
      ]},
    {id:'width-ci',action:'Confidence Interval Width and Sample Size',tier:'support',dom:'inference',
      hint:'Width proportional to 1 over square root of n',
      explain:'Quadrupling n only halves the margin of error',
      latex:'\\text{Width} \\propto \\frac{1}{\\sqrt{n}}',
      blanks:[{latex:'\\text{Width} \\propto \\frac{1}{\\boxed{\\,?\\,}}',answer:'\\sqrt{n}',choices:['\\sqrt{n}','n','n^2']}],
      subconcepts:[
        {q:'To halve the margin of error, you must...',correct:'Quadruple the sample size (multiply n by 4)',wrong:['Double the sample size','Halve the confidence level']},
        {q:'Why square root (not just n)?',correct:'SE has sqrt(n) in the denominator, so ME inherits this',wrong:['Because of the normal distribution','Because we square the SD']},
        {q:'Doubling n reduces ME by what factor?',correct:'About 1.41 (square root of 2)',wrong:['Exactly 2','Exactly 0.5']}
      ]},
    // ── New curriculum-aligned commands (7) ──
    {id:'paired-t',action:'Paired t Statistic',tier:'power',dom:'inf-means',
      hint:'Mean difference over SE of differences',
      explain:'Used when two measurements come from the same subjects (H0: μd = 0)',
      latex:'t = \\frac{\\bar{d} - \\mu_{d_0}}{s_d / \\sqrt{n}}',
      blanks:[
        {latex:'t = \\frac{\\bar{d} - \\mu_{d_0}}{\\boxed{\\,?\\,} / \\sqrt{n}}',answer:'s_d',choices:['s_d','s','\\sigma']},
        {latex:'t = \\frac{\\boxed{\\,?\\,} - \\mu_{d_0}}{s_d / \\sqrt{n}}',answer:'\\bar{d}',choices:['\\bar{d}','\\bar{x}','\\mu_d']},
        {latex:'t = \\frac{\\bar{d} - \\mu_{d_0}}{s_d / \\boxed{\\,?\\,}}',answer:'\\sqrt{n}',choices:['\\sqrt{n}','n','n-1']}
      ],
      subconcepts:[
        {q:'When do you use a paired t-test instead of two-sample?',correct:'When observations are naturally linked (same subjects measured twice)',wrong:['When sample sizes are equal','When populations have equal variance']},
        {q:'What does d-bar represent?',correct:'The mean of the paired differences, in the order defined by the problem',wrong:['The difference of the two sample means','The population mean difference']},
        {q:'What are the degrees of freedom for a paired t-test?',correct:'n minus 1, where n is the number of pairs',wrong:['n1 plus n2 minus 2','The smaller of n1-1 and n2-1']}
      ]},
    {id:'slope-ci',action:'Confidence Interval for Slope',tier:'power',dom:'regression',
      hint:'b plus or minus t-star times s_b',
      explain:'Estimates the true population slope with a confidence interval',
      latex:'b \\pm t^* \\cdot s_b',
      blanks:[
        {latex:'b \\pm \\boxed{\\,?\\,} \\cdot s_b',answer:'t^*',choices:['t^*','z^*','\\chi^2']},
        {latex:'\\boxed{\\,?\\,} \\pm t^* \\cdot s_b',answer:'b',choices:['b','\\beta','\\bar{x}']},
        {latex:'b \\pm t^* \\cdot \\boxed{\\,?\\,}',answer:'s_b',choices:['s_b','s','\\sigma_b']}
      ],
      subconcepts:[
        {q:'Why use t* instead of z* for slope inference?',correct:'Population standard deviation is unknown and estimated from data',wrong:['Because the slope is always t-distributed','Because sample sizes are always small']},
        {q:'If 0 is in the confidence interval for slope, what does that suggest?',correct:'The linear relationship may not be statistically significant',wrong:['The model is perfect','The slope must be exactly zero']},
        {q:'What conditions must be checked for slope CI?',correct:'Linearity, independence, normal residuals, equal variance (LINE)',wrong:['Only normality of x values','Only that n is large enough']}
      ]},
    {id:'df-t',action:'Degrees of Freedom for t-Tests',tier:'support',dom:'inference',
      hint:'Depends on the type of t procedure',
      explain:'df determines the shape of the t distribution used for inference',
      latex:'df = \\begin{cases} n-1 & \\text{one-sample / paired} \\\\ \\min(n_1{-}1,\\,n_2{-}1) & \\text{two-sample (conservative)} \\\\ n-2 & \\text{regression slope} \\end{cases}',
      blanks:[
        {latex:'\\text{One-sample: } df = \\boxed{\\,?\\,}',answer:'n-1',choices:['n-1','n','n-2']},
        {latex:'\\text{Two-sample (conservative): } df = \\boxed{\\,?\\,}',answer:'\\min(n_1{-}1,n_2{-}1)',choices:['\\min(n_1{-}1,n_2{-}1)','n_1+n_2-2','n_1+n_2']},
        {latex:'\\text{Regression slope: } df = \\boxed{\\,?\\,}',answer:'n-2',choices:['n-2','n-1','n']}
      ],
      subconcepts:[
        {q:'Why does df = n-1 for one-sample t?',correct:'One parameter (the mean) is estimated from the data',wrong:['Because we lose one data point randomly','Because the first observation is fixed']},
        {q:'Why is the conservative two-sample df the minimum?',correct:'Using the smaller df gives wider intervals, protecting against error',wrong:['Because the larger sample dominates','Because degrees of freedom must be equal']},
        {q:'What happens to the t distribution as df increases?',correct:'It approaches the standard normal (z) distribution',wrong:['It becomes more spread out','It becomes skewed']}
      ]},
    {id:'large-counts',action:'Large Counts (np \u2265 10 and n(1\u2212p) \u2265 10)',tier:'support',dom:'inf-proportions',
      hint:'np and n(1-p) both at least 10',
      explain:'Ensures the sampling distribution of p-hat is approximately Normal',
      latex:'np \\geq 10 \\quad\\text{and}\\quad n(1-p) \\geq 10',
      blanks:[
        {latex:'\\boxed{\\,?\\,} \\geq 10 \\;\\text{ and }\\; n(1-p) \\geq 10',answer:'np',choices:['np','n','p']},
        {latex:'np \\geq \\boxed{\\,?\\,} \\;\\text{ and }\\; n(1-p) \\geq 10',answer:'10',choices:['10','30','5']}
      ],
      subconcepts:[
        {q:'Why do both np and n(1-p) need to be checked?',correct:'Both the number of successes and failures must be large enough for Normal approximation',wrong:['Only one condition matters','To check independence']},
        {q:'What happens if large counts condition fails?',correct:'The normal approximation for p-hat becomes unreliable, so the standard AP z procedures should not be used (the sampling distribution may be noticeably skewed)',wrong:['The test automatically fails','The p-value doubles']},
        {q:'For a hypothesis test, do you use p0 or p-hat to check large counts?',correct:'Use p0 (the hypothesized value) for hypothesis tests',wrong:['Always use p-hat','Use whichever is larger']}
      ]},
    {id:'type-i-error',action:'Type I Error (\u03b1)',tier:'support',dom:'inference',
      hint:'Rejecting a true null hypothesis',
      explain:'The probability of a false positive, controlled by the significance level',
      latex:'\\alpha = P(\\text{reject } H_0 \\mid H_0 \\text{ is true})',
      blanks:[
        {latex:'\\alpha = P(\\text{reject } H_0 \\mid \\boxed{\\,?\\,})',answer:'H_0 \\text{ is true}',choices:['H_0 \\text{ is true}','H_a \\text{ is true}','H_0 \\text{ is false}']},
        {latex:'\\boxed{\\,?\\,} = P(\\text{reject } H_0 \\mid H_0 \\text{ is true})',answer:'\\alpha',choices:['\\alpha','\\beta','1-\\beta']}
      ],
      subconcepts:[
        {q:'What is a Type I error in everyday terms?',correct:'A false alarm \u2014 concluding an effect exists when it does not',wrong:['Missing a real effect','Getting the wrong sample']},
        {q:'How is the Type I error rate controlled?',correct:'By choosing the significance level \u03b1 before collecting data',wrong:['By increasing sample size','By using a two-tailed test']},
        {q:'If \u03b1 = 0.05, what does that mean?',correct:'There is a 5% chance of rejecting H0 when H0 is actually true',wrong:['There is a 5% chance H0 is true','95% of the data supports H0']}
      ]},
    {id:'type-ii-error',action:'Type II Error (\u03b2)',tier:'support',dom:'inference',
      hint:'Failing to reject a false null hypothesis',
      explain:'The probability of a false negative; power = 1 \u2212 \u03b2',
      latex:'\\beta = P(\\text{fail to reject } H_0 \\mid H_a \\text{ is true})',
      blanks:[
        {latex:'\\beta = P(\\text{fail to reject } H_0 \\mid \\boxed{\\,?\\,})',answer:'H_a \\text{ is true}',choices:['H_a \\text{ is true}','H_0 \\text{ is true}','H_a \\text{ is false}']},
        {latex:'\\text{Power} = 1 - \\boxed{\\,?\\,}',answer:'\\beta',choices:['\\beta','\\alpha','p']}
      ],
      subconcepts:[
        {q:'What is a Type II error in everyday terms?',correct:'A missed detection \u2014 failing to notice a real effect',wrong:['A false alarm','Proving the null hypothesis']},
        {q:'What is the relationship between Type II error and power?',correct:'Power = 1 \u2212 \u03b2, so lower \u03b2 means higher power',wrong:['Power = \u03b2','Power = \u03b1 + \u03b2']},
        {q:'How can you reduce Type II error?',correct:'Increase sample size, increase \u03b1, or study a larger effect',wrong:['Decrease the significance level','Use a one-tailed test always']}
      ]},
    {id:'log-transform',action:'Log Transform (linearize exponential data)',tier:'power',dom:'regression',
      hint:'Take log of response variable to linearize curved relationships',
      explain:'Used when a scatterplot shows exponential or power-law curvature',
      latex:'\\log(\\hat{y}) = a + bx \\quad\\Rightarrow\\quad \\hat{y} = 10^{a + bx}',
      blanks:[
        {latex:'\\boxed{\\,?\\,} = 10^{a + bx}',answer:'\\hat{y}',choices:['\\hat{y}','\\log(\\hat{y})','y']},
        {latex:'\\log(\\hat{y}) = \\boxed{\\,?\\,} + bx',answer:'a',choices:['a','\\bar{y}','10']}
      ],
      subconcepts:[
        {q:'When should you consider a log transformation?',correct:'When the scatterplot shows a curved (exponential) pattern',wrong:['When the data is already linear','When the residuals are centered at zero']},
        {q:'After fitting log(y) = a + bx, how do you predict y?',correct:'Back-transform: y-hat = 10 raised to (a + bx)',wrong:['Just use a + bx directly','Take the log of a + bx']},
        {q:'What should the residual plot of log(y) vs x look like if transformation worked?',correct:'Random scatter with no pattern (linearized relationship)',wrong:['A curved pattern','A positive trend']}
      ]},
    {id:'variance',action:'Sample Variance (s\u00b2)',tier:'support',dom:'descriptive',
      hint:'Sum of squared deviations divided by n-1',
      explain:'The square of the standard deviation \u2014 used in linear combination rules',
      latex:'s^2 = \\frac{\\sum(x_i - \\bar{x})^2}{n-1}',
      blanks:[
        {latex:'s^2 = \\frac{\\sum(x_i - \\bar{x})^2}{\\boxed{\\,?\\,}}',answer:'n-1',choices:['n-1','n','n+1']},
        {latex:'s^2 = \\frac{\\sum\\boxed{\\,?\\,}}{n-1}',answer:'(x_i - \\bar{x})^2',choices:['(x_i - \\bar{x})^2','|x_i - \\bar{x}|','x_i^2']}
      ],
      subconcepts:[
        {q:'Why square the deviations?',correct:'To emphasize larger deviations and prevent canceling',wrong:['To make computation easier','To normalize values']},
        {q:'Why use n-1 instead of n?',correct:'Degrees of freedom correction for sample bias',wrong:['To make the result smaller','Because one value is always zero']},
        {q:'How is variance related to standard deviation?',correct:'SD is the square root of variance',wrong:['They are the same thing','Variance is always larger']}
      ]},
    {id:'ten-pct-condition',action:'10% Condition for Independence',tier:'support',dom:'inference',
      hint:'Sample must be less than 10% of the population',
      explain:'Ensures sampling without replacement is approximately independent',
      latex:'n < 0.10 \\cdot N',
      blanks:[
        {latex:'n < \\boxed{\\,?\\,} \\cdot N',answer:'0.10',choices:['0.10','0.05','0.50']},
        {latex:'n < 0.10 \\cdot \\boxed{\\,?\\,}',answer:'N',choices:['N','n-1','\\mu']}
      ],
      subconcepts:[
        {q:'Why does sampling without replacement matter?',correct:'Each draw changes the remaining pool slightly',wrong:['It doesn\'t matter','It makes the sample biased']},
        {q:'What does N represent?',correct:'The total population size',wrong:['The sample size','The number of trials']},
        {q:'If n=50 and N=200, is the condition met?',correct:'No \u2014 50 is 25% of 200, which exceeds 10%',wrong:['Yes \u2014 50 < 200','Cannot determine']}
      ]},
    {id:'std-resid-chi',action:'Standardized Residual (Chi-Square)',tier:'support',dom:'chi-square',
      hint:'Each cell\'s contribution: (O-E)/sqrt(E)',
      explain:'Shows which cells contribute most to the chi-square statistic',
      latex:'\\text{std resid} = \\frac{O - E}{\\sqrt{E}}',
      blanks:[
        {latex:'\\text{std resid} = \\frac{O - E}{\\boxed{\\,?\\,}}',answer:'\\sqrt{E}',choices:['\\sqrt{E}','E','E^2']},
        {latex:'\\text{std resid} = \\frac{\\boxed{\\,?\\,}}{\\sqrt{E}}',answer:'O - E',choices:['O - E','E - O','O \\cdot E']}
      ],
      subconcepts:[
        {q:'What does a large standardized residual indicate?',correct:'That cell deviates greatly from what H\u2080 predicted',wrong:['The cell has the most data','The expected count was wrong']},
        {q:'What does a positive standardized residual mean?',correct:'Observed count exceeds expected count',wrong:['Expected exceeds observed','The test is significant']},
        {q:'How does this relate to the chi-square statistic?',correct:'Chi-square is the sum of squared standardized residuals',wrong:['They are the same','Chi-square is the average']}
      ]},
    {id:'one-prop-ci',action:'Confidence Interval for One Proportion',tier:'regular',dom:'inf-proportions',
      hint:'p-hat plus or minus z-star times SE of p-hat',
      explain:'Estimates the range of plausible values for the true population proportion',
      latex:'\\hat{p} \\pm z^* \\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n}}',
      blanks:[
        {latex:'\\hat{p} \\pm z^* \\sqrt{\\frac{\\boxed{\\,?\\,}}{n}}',answer:'\\hat{p}(1-\\hat{p})',choices:['\\hat{p}(1-\\hat{p})','p_0(1-p_0)','\\hat{p}^2']},
        {latex:'\\hat{p} \\pm \\boxed{\\,?\\,} \\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n}}',answer:'z^*',choices:['z^*','t^*','\\chi^2']}
      ],
      subconcepts:[
        {q:'Why use p-hat instead of p\u2080 in the SE?',correct:'The true p is unknown; we estimate with p-hat',wrong:['p-hat is always more accurate','To match the null hypothesis']},
        {q:'What does z* depend on?',correct:'The confidence level (e.g., 1.96 for 95%)',wrong:['The sample size','The sample proportion']},
        {q:'What conditions must be checked?',correct:'Random sample, 10% condition, large counts (np-hat and n(1-p-hat) \u2265 10)',wrong:['Only random sample','n \u2265 30']}
      ]},
    {id:'two-prop-ci',action:'CI for Difference of Two Proportions',tier:'power',dom:'inf-proportions',
      hint:'Difference of p-hats plus or minus z-star times SE',
      explain:'Estimates the range of plausible values for p\u2081 - p\u2082',
      latex:'(\\hat{p}_1 - \\hat{p}_2) \\pm z^* \\sqrt{\\frac{\\hat{p}_1(1-\\hat{p}_1)}{n_1} + \\frac{\\hat{p}_2(1-\\hat{p}_2)}{n_2}}',
      blanks:[
        {latex:'(\\hat{p}_1 - \\hat{p}_2) \\pm \\boxed{\\,?\\,} \\sqrt{\\frac{\\hat{p}_1(1-\\hat{p}_1)}{n_1} + \\frac{\\hat{p}_2(1-\\hat{p}_2)}{n_2}}',answer:'z^*',choices:['z^*','t^*','\\chi^2']},
        {latex:'(\\hat{p}_1 - \\hat{p}_2) \\pm z^* \\sqrt{\\frac{\\hat{p}_1(1-\\hat{p}_1)}{n_1} \\boxed{\\,?\\,} \\frac{\\hat{p}_2(1-\\hat{p}_2)}{n_2}}',answer:'+',choices:['+','-','\\times']}
      ],
      subconcepts:[
        {q:'Why do we add the two variance terms under the square root?',correct:'Independent samples have variances that add',wrong:['To increase sample size','Proportions always add']},
        {q:'Why use separate p-hat values instead of pooling?',correct:'For CIs we don\'t assume p\u2081=p\u2082 (no null hypothesis)',wrong:['Pooling is always wrong','To make SE larger']},
        {q:'What does it mean if 0 is in the interval?',correct:'No convincing evidence of a difference between proportions',wrong:['The proportions are equal','The test failed']}
      ]},
    {id:'one-mean-ci',action:'Confidence Interval for One Mean',tier:'regular',dom:'inf-means',
      hint:'x-bar plus or minus t-star times s over root n',
      explain:'Estimates the range of plausible values for the true population mean',
      latex:'\\bar{x} \\pm t^* \\frac{s}{\\sqrt{n}}',
      blanks:[
        {latex:'\\bar{x} \\pm \\boxed{\\,?\\,} \\frac{s}{\\sqrt{n}}',answer:'t^*',choices:['t^*','z^*','\\chi^2']},
        {latex:'\\bar{x} \\pm t^* \\frac{\\boxed{\\,?\\,}}{\\sqrt{n}}',answer:'s',choices:['s','\\sigma','\\bar{x}']}
      ],
      subconcepts:[
        {q:'Why use t* instead of z*?',correct:'Because population \u03c3 is unknown; we estimate with s',wrong:['t* is always larger','z* only works for proportions']},
        {q:'What are the degrees of freedom?',correct:'n - 1',wrong:['n','n - 2']},
        {q:'What conditions must be checked?',correct:'Random sample, 10% condition, Normal/large sample',wrong:['Only n \u2265 30','Random and independent only']}
      ]},
    {id:'two-mean-ci',action:'CI for Difference of Two Means',tier:'power',dom:'inf-means',
      hint:'Difference of x-bars plus or minus t-star times SE',
      explain:'Estimates the range of plausible values for \u03bc\u2081 - \u03bc\u2082',
      latex:'(\\bar{x}_1 - \\bar{x}_2) \\pm t^* \\sqrt{\\frac{s_1^2}{n_1} + \\frac{s_2^2}{n_2}}',
      blanks:[
        {latex:'(\\bar{x}_1 - \\bar{x}_2) \\pm \\boxed{\\,?\\,} \\sqrt{\\frac{s_1^2}{n_1} + \\frac{s_2^2}{n_2}}',answer:'t^*',choices:['t^*','z^*','F']},
        {latex:'(\\bar{x}_1 - \\bar{x}_2) \\pm t^* \\sqrt{\\frac{\\boxed{\\,?\\,}}{n_1} + \\frac{s_2^2}{n_2}}',answer:'s_1^2',choices:['s_1^2','s_1','\\sigma_1']}
      ],
      subconcepts:[
        {q:'Why use s\u00b2 instead of s in the formula?',correct:'Variances add for independent samples; SDs do not',wrong:['s\u00b2 is easier to calculate','To match the t-distribution']},
        {q:'Why add the two fractions under the square root?',correct:'Independent samples \u2014 variances add',wrong:['To double the sample size','Because means always add']},
        {q:'What distribution do we use?',correct:'t-distribution with complex (Welch) df',wrong:['Standard Normal z','Chi-square']}
      ]},
    {id:'random-condition',action:'Random Sample or Random Assignment Required',tier:'support',dom:'inference',
      hint:'Data must come from a random sample or randomized experiment',
      explain:'Without randomization, results may be biased and inference invalid',
      latex:'\\text{Data from random sample or randomized experiment}',
      blanks:[
        {latex:'\\text{Data from } \\boxed{\\,?\\,} \\text{ sample or randomized experiment}',answer:'\\text{random}',choices:['\\text{random}','\\text{large}','\\text{normal}']},
        {latex:'\\text{Supports valid } \\boxed{\\,?\\,} \\text{-based inference}',answer:'\\text{probability}',choices:['\\text{probability}','\\text{sample}','\\text{normal}']}
      ],
      subconcepts:[
        {q:'Why is randomization required for inference?',correct:'It ensures the sample represents the population without systematic bias',wrong:['It makes calculations easier','It guarantees a normal distribution']},
        {q:'What is the difference between random sampling and random assignment?',correct:'Sampling generalizes to population; assignment establishes causation',wrong:['They are the same thing','Assignment generalizes; sampling establishes causation']},
        {q:'Can you do inference without randomization?',correct:'Generally no \u2014 results may not generalize beyond the sample',wrong:['Yes, as long as n is large','Only for proportions']}
      ]},
    {id:'normal-condition',action:'Normal/Large Sample (CLT or n \u2265 30)',tier:'support',dom:'inference',
      hint:'Check that the sampling distribution is approximately Normal',
      explain:'For means: n \u2265 30 by CLT, OR population is Normal, OR sample data look roughly normal with no strong skew or outliers (for small n). For proportions, use large-counts.',
      latex:'\\text{Proportions: } n\\hat{p},\\; n(1-\\hat{p}) \\geq 10 \\text{ (CI)} \\;|\\; np_0,\\; n(1-p_0) \\geq 10 \\text{ (test)} \\;|\\; \\text{Means: } n \\geq 30',
      blanks:[
        {latex:'\\text{Proportions: } np \\geq \\boxed{\\,?\\,}',answer:'10',choices:['10','30','5']},
        {latex:'\\text{Means: } n \\geq \\boxed{\\,?\\,} \\text{ or population Normal}',answer:'30',choices:['30','10','50']}
      ],
      subconcepts:[
        {q:'Why do proportions and means have different rules?',correct:'Proportions use the binomial (need large counts); means use CLT (need large n)',wrong:['They use the same rule','Means are always Normal']},
        {q:'What does "large counts" mean for proportions?',correct:'Both np and n(1-p) must be at least 10',wrong:['n must be at least 30','The sample must be larger than the population']},
        {q:'What if the population is known to be Normal?',correct:'Any sample size works for means (CLT not needed)',wrong:['You still need n \u2265 30','Normal populations can\'t be sampled']}
      ]},
    {id:'p-value-interp',action:'P-Value (prob of data given H\u2080 true)',tier:'support',dom:'inference',
      hint:'Probability of the observed result or more extreme, assuming H\u2080 is true',
      explain:'NOT the probability that H\u2080 is true \u2014 it is conditional on H\u2080',
      latex:'P\\text{-value} = P(\\text{observed or more extreme} \\mid H_0 \\text{ true})',
      blanks:[
        {latex:'P\\text{-value} = P(\\text{observed or more extreme} \\mid \\boxed{\\,?\\,})',answer:'H_0 \\text{ true}',choices:['H_0 \\text{ true}','H_a \\text{ true}','\\alpha']},
        {latex:'\\text{Reject } H_0 \\text{ when p-value} \\boxed{\\,?\\,} \\alpha',answer:'<',choices:['<','>','=']}
      ],
      subconcepts:[
        {q:'What is a common misconception about p-values?',correct:'That p-value is the probability H\u2080 is true (it\'s not \u2014 it assumes H\u2080)',wrong:['That p-values are always small','That p-values measure effect size']},
        {q:'If p-value = 0.03 and \u03b1 = 0.05, what do you conclude?',correct:'Reject H\u2080 \u2014 the result is statistically significant',wrong:['Fail to reject H\u2080','Accept H\u2080']},
        {q:'What does a large p-value mean?',correct:'The observed data is consistent with H\u2080 (not enough evidence to reject)',wrong:['H\u2080 is definitely true','The sample was too small']}
      ]},
  ],

  // Generate a question for an enemy at spawn time
  generateQuestion(cmd, allCommands){
    const diff=G.difficulty||'learn';
    // Base weights by difficulty (renormalized over available types below)
    const baseW={learn:{identify:0.40,fillblank:0.25,variable:0.15,application:0.10,relationship:0.10},
      practice:{identify:0.15,fillblank:0.45,variable:0.10,application:0.15,relationship:0.15},
      challenge:{identify:0.05,fillblank:0.45,variable:0.10,application:0.20,relationship:0.20}};
    const bw=baseW[diff]||baseW.learn;
    // Build available weights for this command
    const w={};
    w.identify=bw.identify; // always available
    if(cmd.blanks&&cmd.blanks.length>0)w.fillblank=bw.fillblank;
    if(this.variableBank[cmd.id])w.variable=bw.variable;
    if(this.applicationBank[cmd.id])w.application=bw.application;
    if(this.relationshipBank[cmd.id])w.relationship=bw.relationship;
    // Renormalize
    const total=Object.values(w).reduce((a,b)=>a+b,0);
    let roll=Math.random()*total,type='identify';
    for(const[k,v]of Object.entries(w)){roll-=v;if(roll<=0){type=k;break}}

    function stripNot(s){return s.replace(/\s*\([^)]*\)\s*$/,'').trim()}

    if(type==='variable'){
      const vars=this.variableBank[cmd.id];
      const v=vars[Math.floor(Math.random()*vars.length)];
      const allDescs=[];
      for(const id of Object.keys(this.variableBank)){
        if(id===cmd.id)continue;
        this.variableBank[id].forEach(vv=>{if(vv.d!==v.d&&!allDescs.includes(vv.d))allDescs.push(vv.d)});
      }
      const distractors=shuffleArr(allDescs).slice(0,3);
      const options=shuffleArr([v.d,...distractors]);
      const correctIdx=options.indexOf(v.d);
      return{type:'variable',latex:cmd.latex,symbol:v.s,options,correctIdx,correctKey:['a','b','c','d'][correctIdx]};
    }
    if(type==='application'){
      const bank=this.applicationBank[cmd.id];
      const entry=bank[Math.floor(Math.random()*bank.length)];
      const correctLabel=stripNot(cmd.action);
      // Build distractors from confusionSet, then same-domain fallback
      const picks=[];const usedTexts=new Set([correctLabel.toLowerCase()]);
      if(entry.confusionSet){
        for(const cid of shuffleArr([...entry.confusionSet])){
          if(picks.length>=3)break;
          const c=allCommands.find(cc=>cc.id===cid);
          if(c){const text=stripNot(c.action);if(!usedTexts.has(text.toLowerCase())){picks.push(text);usedTexts.add(text.toLowerCase())}}
        }
      }
      // Fallback: same domain then any
      for(const c of shuffleArr(allCommands.filter(c=>c.id!==cmd.id))){
        if(picks.length>=3)break;
        const text=stripNot(c.action);
        if(!usedTexts.has(text.toLowerCase())){picks.push(text);usedTexts.add(text.toLowerCase())}
      }
      const options=shuffleArr([correctLabel,...picks]);
      const correctIdx=options.indexOf(correctLabel);
      return{type:'application',scenario:entry.scenario,options,correctIdx,correctKey:['a','b','c','d'][correctIdx]};
    }
    if(type==='relationship'){
      const bank=this.relationshipBank[cmd.id];
      const entry=bank[Math.floor(Math.random()*bank.length)];
      const correct=entry.direction.charAt(0).toUpperCase()+entry.direction.slice(1);
      const allDirs=['Increases','Decreases','Stays the same'];
      const options=shuffleArr(allDirs);
      const correctIdx=options.indexOf(correct);
      return{type:'relationship',latex:cmd.latex,input:entry.input,output:entry.output,direction:correct,explain:entry.explain,formulaName:stripNot(cmd.action),options,correctIdx,correctKey:['a','b','c'][correctIdx]};
    }
    if(type==='identify'){
      const sameDom=allCommands.filter(c=>c.id!==cmd.id&&c.dom===cmd.dom);
      const diffDom=allCommands.filter(c=>c.id!==cmd.id&&c.dom!==cmd.dom);
      const pool=[...sameDom,...shuffleArr(diffDom)];
      const correctLabel=stripNot(cmd.action);
      const picks=[];const usedTexts=new Set([correctLabel.toLowerCase()]);
      for(const c of shuffleArr(pool)){
        if(picks.length>=3)break;
        const text=stripNot(c.action);
        if(!usedTexts.has(text.toLowerCase())){picks.push(text);usedTexts.add(text.toLowerCase())}
      }
      for(const c of shuffleArr(allCommands)){
        if(picks.length>=3)break;
        const text=stripNot(c.action);
        if(!usedTexts.has(text.toLowerCase())){picks.push(text);usedTexts.add(text.toLowerCase())}
      }
      const options=shuffleArr([correctLabel,...picks]);
      const correctIdx=options.indexOf(correctLabel);
      return{type:'identify',latex:cmd.latex,options,correctIdx,correctKey:['a','b','c','d'][correctIdx]};
    }
    // fillblank
    const blank=cmd.blanks[Math.floor(Math.random()*cmd.blanks.length)];
    const shuffledChoices=shuffleArr([...blank.choices]);
    const correctIdx=shuffledChoices.indexOf(blank.choices[0]);
    return{type:'fillblank',latex:blank.latex,answer:blank.answer,choices:shuffledChoices,correctIdx,fullLatex:cmd.latex};
  },

  formatPrompt(cmd){return cmd.action},
  formatAnswer(cmd){return cmd.latex?'(formula)':cmd.action},

  // Validate fill-blank answers
  validateBlank(input,answer){
    function norm(s){return s.trim().toLowerCase().replace(/\s+/g,'').replace(/\u03c3/g,'sigma').replace(/\u03bc/g,'mu').replace(/\u03b2/g,'beta').replace(/\u03c7/g,'chi').replace(/\\hat\{p\}/g,'phat').replace(/\\bar\{x\}/g,'xbar').replace(/p\u0302/g,'phat').replace(/x\u0304/g,'xbar').replace(/[\\{}_]/g,'')}
    const ni=norm(input),na=norm(answer);
    if(ni===na)return true;
    // Common aliases
    const aliases={'p0':'p0','p_0':'p0','phat':'phat','p-hat':'phat','phat1':'phat1','p-hat1':'phat1',
      'pc':'pc','p_c':'pc','phatc':'pc','mu0':'mu0','mu_0':'mu0','beta0':'beta0','beta_0':'beta0',
      'sx':'sx','s_x':'sx','sigma_x':'sigma_x','σx':'sigma_x','σ_x':'sigma_x','sy':'sy','s_y':'sy','s1^2':'s1^2','s1²':'s1^2','sigma1^2':'sigma1^2',
      'σ1^2':'sigma1^2','σ1²':'sigma1^2','n2':'n2','n_2':'n2','p(xi)':'p(xi)','p(x_i)':'p(xi)',
      'p(a∩b)':'p(a∩b)','p(anb)':'p(a∩b)','p(a and b)':'p(a∩b)','p(b)':'p(b)'};
    const ai=aliases[ni]||ni, aa=aliases[na]||na;
    return ai===aa;
  },
};

const VARIABLE_BANK={
  'mean':[{s:'\\bar{x}',d:'sample mean'},{s:'x_i',d:'individual data values'},{s:'n',d:'sample size'}],
  'std-dev':[{s:'s',d:'sample standard deviation'},{s:'n-1',d:'degrees of freedom'}],
  'linreg':[{s:'\\hat{y}',d:'predicted response'},{s:'b',d:'slope'},{s:'a',d:'y-intercept'}],
  'linreg-mean':[{s:'\\bar{x}',d:'mean of x-values'},{s:'\\bar{y}',d:'mean of y-values'}],
  'corr-r':[{s:'r',d:'correlation coefficient'},{s:'z_x',d:'standardized x'},{s:'z_y',d:'standardized y'}],
  'slope-b':[{s:'b',d:'sample slope'},{s:'r',d:'correlation coefficient'},{s:'s_y',d:'SD of y-values'},{s:'s_x',d:'SD of x-values'}],
  'zscore':[{s:'z',d:'z-score'},{s:'\\mu',d:'population mean'},{s:'\\sigma',d:'population SD'}],
  'iqr':[{s:'IQR',d:'interquartile range'},{s:'Q_1',d:'25th percentile'},{s:'Q_3',d:'75th percentile'}],
  'outlier-iqr':[{s:'Q_1',d:'25th percentile'},{s:'Q_3',d:'75th percentile'},{s:'IQR',d:'spread of middle 50%'}],
  'empirical-rule':[{s:'\\mu',d:'center of distribution'},{s:'\\sigma',d:'standard deviation'},{s:'2\\sigma',d:'captures ~95% of data'}],
  'residual':[{s:'e',d:'residual'},{s:'y',d:'observed value'},{s:'\\hat{y}',d:'predicted value'}],
  'r-squared':[{s:'r^2',d:'proportion of variation explained'},{s:'r',d:'correlation coefficient'}],
  'y-intercept':[{s:'a',d:'y-intercept'},{s:'\\bar{y}',d:'mean of y'},{s:'\\bar{x}',d:'mean of x'}],
  'add-rule':[{s:'P(A \\cup B)',d:'prob of A or B'},{s:'P(A \\cap B)',d:'prob of A and B'}],
  'cond-prob':[{s:'P(A|B)',d:'prob of A given B'},{s:'P(B)',d:'prob of condition'}],
  'complement':[{s:'P(A^c)',d:'prob event does NOT happen'},{s:'P(A)',d:'prob event happens'}],
  'mult-rule':[{s:'P(A \\cap B)',d:'prob of both'},{s:'P(B|A)',d:'prob of B given A'}],
  'mult-independent':[{s:'P(A)',d:'prob of first event'},{s:'P(B)',d:'prob of second event'}],
  'rv-mean':[{s:'\\mu_X',d:'expected value'},{s:'x_i',d:'possible outcomes'},{s:'P(x_i)',d:'probability of each outcome'}],
  'rv-sd':[{s:'\\sigma_X',d:'SD of random variable'},{s:'\\mu_X',d:'expected value'}],
  'binom-pmf':[{s:'n',d:'number of trials'},{s:'x',d:'number of successes'},{s:'p',d:'prob of success per trial'}],
  'binom-mean':[{s:'\\mu',d:'expected number of successes'},{s:'n',d:'number of trials'},{s:'p',d:'prob of success'}],
  'binom-sd':[{s:'\\sigma',d:'SD of binomial'},{s:'n',d:'number of trials'},{s:'p',d:'prob of success'}],
  'geom-pmf':[{s:'x',d:'trial of first success'},{s:'p',d:'prob of success per trial'}],
  'geom-mean':[{s:'\\mu',d:'expected trials to first success'},{s:'p',d:'prob of success'}],
  'geom-sd':[{s:'\\sigma',d:'SD of geometric'},{s:'p',d:'prob of success'}],
  'lincomb-mean':[{s:'a',d:'coefficient/multiplier'},{s:'\\mu_X',d:'mean of X'},{s:'\\mu_Y',d:'mean of Y'}],
  'lincomb-var':[{s:'a^2',d:'squared coefficient'},{s:'\\sigma^2_X',d:'variance of X'}],
  'lintransform':[{s:'a',d:'shift \u2014 moves center only'},{s:'b',d:'multiplier \u2014 stretches spread'}],
  'chi-sq':[{s:'\\chi^2',d:'test statistic'},{s:'O',d:'observed count'},{s:'E',d:'expected count'}],
  'expected-twoway':[{s:'E',d:'expected count'},{s:'n',d:'grand total'}],
  'expected-gof':[{s:'E',d:'expected count'},{s:'n',d:'sample size'},{s:'p',d:'hypothesized proportion'}],
  'df-gof':[{s:'df',d:'degrees of freedom'},{s:'k',d:'number of categories'}],
  'df-twoway':[{s:'r',d:'number of rows'},{s:'c',d:'number of columns'}],
  'chi-sq-select':[{s:'\\text{GOF}',d:'test for one variable vs claimed distribution'},{s:'\\text{Homogeneity}',d:'test for one variable across multiple populations'},{s:'\\text{Independence}',d:'test for association between two variables in one population'}],
  'chi-sq-hyp':[{s:'H_0',d:'null hypothesis of no difference, no association, or fits the claim'},{s:'H_a',d:'alternative that at least one category differs or variables are associated'},{s:'\\chi^2',d:'right-tailed test statistic for categorical inference'}],
  'chi-sq-conditions':[{s:'E_i',d:'expected count in cell i'},{s:'N',d:'population size for the 10% condition'},{s:'5',d:'minimum expected count threshold'}],
  'chi-sq-conclude':[{s:'P\\text{-value}',d:'probability of a result this extreme under H_0'},{s:'\\alpha',d:'significance level cutoff'},{s:'H_0',d:'null hypothesis referenced in reject/fail to reject statements'}],
  'chi-sq-output':[{s:'\\chi^2',d:'computer-reported test statistic'},{s:'df',d:'degrees of freedom used to read the p-value'},{s:'P\\text{-value}',d:'reported tail probability for the test'}],
  'z-test-stat':[{s:'z',d:'test statistic'},{s:'SE',d:'standard error'}],
  'ci-formula':[{s:'\\text{statistic}',d:'point estimate'},{s:'SE',d:'standard error'}],
  'power':[{s:'\\beta',d:'prob of Type II error'},{s:'\\text{Power}',d:'prob of correctly rejecting false H_0'}],
  'margin-error':[{s:'ME',d:'margin of error'},{s:'z^*',d:'critical value'}],
  'width-ci':[{s:'n',d:'sample size'},{s:'ME',d:'margin of error'}],
  'df-t':[{s:'df',d:'degrees of freedom'},{s:'n',d:'sample size'}],
  'type-i-error':[{s:'\\alpha',d:'significance level'},{s:'H_0',d:'null hypothesis'}],
  'type-ii-error':[{s:'\\beta',d:'Type II error rate'},{s:'H_a',d:'alternative hypothesis'}],
  'large-counts':[{s:'n',d:'sample size'},{s:'p',d:'proportion'},{s:'np',d:'expected successes'}],
  'phat-mean':[{s:'\\mu_{\\hat{p}}',d:'center of sampling dist'},{s:'p',d:'true population proportion'}],
  'phat-sd':[{s:'\\sigma_{\\hat{p}}',d:'SD of sampling dist'},{s:'p',d:'population proportion'},{s:'n',d:'sample size'}],
  'phat-se':[{s:'s_{\\hat{p}}',d:'standard error of p-hat'},{s:'\\hat{p}',d:'sample proportion'},{s:'n',d:'sample size'}],
  'diff-p-sd':[{s:'p_1',d:'population proportion group 1'},{s:'p_2',d:'population proportion group 2'},{s:'n_1',d:'sample size group 1'}],
  'diff-p-se':[{s:'\\hat{p}_1',d:'sample proportion group 1'},{s:'\\hat{p}_2',d:'sample proportion group 2'}],
  'pooled-se':[{s:'\\hat{p}_c',d:'combined sample proportion'},{s:'n_1',d:'sample size group 1'},{s:'n_2',d:'sample size group 2'}],
  'one-prop-z':[{s:'\\hat{p}',d:'sample proportion'},{s:'p_0',d:'hypothesized proportion under H_0'},{s:'n',d:'sample size'}],
  'two-prop-z':[{s:'\\hat{p}_1',d:'sample proportion group 1'},{s:'\\hat{p}_2',d:'sample proportion group 2'},{s:'\\hat{p}_c',d:'pooled proportion'}],
  'xbar-mean':[{s:'\\mu_{\\bar{x}}',d:'center of sampling dist'},{s:'\\mu',d:'population mean'}],
  'xbar-sd':[{s:'\\sigma_{\\bar{x}}',d:'SD of sampling dist'},{s:'\\sigma',d:'population SD'},{s:'n',d:'sample size'}],
  'xbar-se':[{s:'s_{\\bar{x}}',d:'standard error of x-bar'},{s:'s',d:'sample SD'},{s:'n',d:'sample size'}],
  'diff-x-sd':[{s:'\\sigma_1',d:'pop SD group 1'},{s:'\\sigma_2',d:'pop SD group 2'}],
  'diff-x-se':[{s:'s_1',d:'sample SD group 1'},{s:'s_2',d:'sample SD group 2'}],
  'one-mean-t':[{s:'\\bar{x}',d:'sample mean'},{s:'\\mu_0',d:'hypothesized mean under H_0'},{s:'s',d:'sample SD'}],
  'two-mean-t':[{s:'\\bar{x}_1',d:'sample mean group 1'},{s:'\\bar{x}_2',d:'sample mean group 2'}],
  'paired-t':[{s:'\\bar{d}',d:'mean of paired differences'},{s:'s_d',d:'SD of differences'},{s:'n',d:'number of pairs'}],
  'slope-mean':[{s:'\\mu_b',d:'center of slope sampling dist'},{s:'\\beta',d:'true population slope'}],
  'slope-sd':[{s:'\\sigma',d:'residual SD'},{s:'\\sigma_x',d:'SD of x-values'},{s:'n',d:'sample size'}],
  'slope-se':[{s:'s',d:'residual SD'},{s:'s_x',d:'sample SD of x'},{s:'n-1',d:'df adjustment'}],
  'resid-s':[{s:'s',d:'residual SD'},{s:'n-2',d:'df for regression'}],
  'slope-t':[{s:'b',d:'sample slope'},{s:'s_b',d:'SE of slope'}],
  'slope-ci':[{s:'b',d:'sample slope'},{s:'t^*',d:'critical value'},{s:'s_b',d:'standard error of slope'}],
  'log-transform':[{s:'\\hat{y}',d:'predicted response'},{s:'a',d:'intercept'},{s:'b',d:'slope of log model'}],
  'variance':[{s:'s^2',d:'sample variance'},{s:'n-1',d:'degrees of freedom'},{s:'\\bar{x}',d:'sample mean'}],
  'ten-pct-condition':[{s:'n',d:'sample size'},{s:'N',d:'population size'}],
  'std-resid-chi':[{s:'O',d:'observed count'},{s:'E',d:'expected count'}],
  'one-prop-ci':[{s:'\\hat{p}',d:'sample proportion'},{s:'z^*',d:'critical value'},{s:'n',d:'sample size'}],
  'two-prop-ci':[{s:'\\hat{p}_1',d:'sample proportion group 1'},{s:'\\hat{p}_2',d:'sample proportion group 2'},{s:'z^*',d:'critical value'}],
  'one-mean-ci':[{s:'\\bar{x}',d:'sample mean'},{s:'t^*',d:'critical value'},{s:'s',d:'sample SD'}],
  'two-mean-ci':[{s:'\\bar{x}_1',d:'sample mean group 1'},{s:'s_1^2',d:'sample variance group 1'},{s:'t^*',d:'critical value'}],
  'random-condition':[{s:'\\text{random}',d:'random selection or assignment'}],
  'normal-condition':[{s:'np',d:'expected successes'},{s:'n(1-p)',d:'expected failures'},{s:'n',d:'sample size'}],
  'p-value-interp':[{s:'P\\text{-value}',d:'probability of observed or more extreme result, assuming H\u2080 true'},{s:'\\alpha',d:'significance level'}],
};

// ── Application Bank: scenario-based "which formula?" questions ──
const APPLICATION_BANK={
  'mean':[{scenario:'A teacher records 30 test scores and wants to find the typical score for the class.',confusionSet:['rv-mean','xbar-mean','linreg-mean']}],
  'std-dev':[{scenario:'A quality engineer measures the spread of fill volumes in 50 bottles from a production line.',confusionSet:['variance','rv-sd','iqr']}],
  'linreg':[{scenario:'A biologist collects height and weight data for 40 birds and wants to predict weight from height.',confusionSet:['corr-r','slope-b','linreg-mean']}],
  'linreg-mean':[{scenario:'A student plots bivariate data and draws a prediction line. She wants to verify it passes through a specific landmark point of the dataset.',confusionSet:['linreg','y-intercept','slope-b']}],
  'corr-r':[{scenario:'A researcher wants a single number summarizing the strength and direction of a linear relationship between study hours and GPA.',confusionSet:['r-squared','slope-b','linreg']}],
  'slope-b':[{scenario:'A researcher knows the correlation between hours studied and test scores is 0.85, with score SD = 12 and hours SD = 3. She wants to know how much the predicted score changes per additional hour.',confusionSet:['corr-r','linreg','y-intercept']}],
  'zscore':[{scenario:'An admissions officer wants to compare an SAT score of 1350 to an ACT score of 30 on a common scale.',confusionSet:['mean','std-dev','empirical-rule']}],
  'iqr':[{scenario:'A teacher wants a resistant measure of spread for test scores that has several extreme outliers.',confusionSet:['std-dev','variance','outlier-iqr']}],
  'outlier-iqr':[{scenario:'A student must determine whether a home price of $1.2M is an outlier in a dataset with Q1=200K and Q3=400K.',confusionSet:['iqr','zscore','empirical-rule']}],
  'empirical-rule':[{scenario:'Heights are roughly Normal with mean 64 in. and SD 2.5 in. About what percent fall between 59 and 69 inches?',confusionSet:['zscore','std-dev','normal-condition']}],
  'residual':[{scenario:'A model predicts a car gets 28 mpg, but the actual value is 31 mpg. What is the prediction error?',confusionSet:['linreg','r-squared','resid-s']}],
  'r-squared':[{scenario:'A researcher reports r = 0.90 and is asked what proportion of variation in y is explained by the model.',confusionSet:['corr-r','slope-b','resid-s']}],
  'y-intercept':[{scenario:'A researcher knows the slope and the mean of each variable. She needs the starting value of the prediction line when x is zero.',confusionSet:['linreg','linreg-mean','slope-b']}],
  'variance':[{scenario:'Before combining two independent random variables, a statistician must first express each variable\'s spread as a squared quantity.',confusionSet:['std-dev','lincomb-var','rv-sd']}],
  'add-rule':[{scenario:'In a class of 30, 18 play sports and 12 are in band; 5 do both. Find P(sports or band).',confusionSet:['mult-rule','complement','cond-prob']}],
  'cond-prob':[{scenario:'Of 200 patients, 60 have condition A and 30 have both A and B. Find the probability of B given A.',confusionSet:['mult-rule','add-rule','mult-independent']}],
  'complement':[{scenario:'The probability of rain on any given day is 0.35. A student needs P(no rain).',confusionSet:['add-rule','cond-prob','mult-independent']}],
  'mult-rule':[{scenario:'Two cards are drawn without replacement. Find the probability both are aces.',confusionSet:['mult-independent','cond-prob','add-rule']}],
  'mult-independent':[{scenario:'A fair coin is flipped and a fair die is rolled. Find P(heads and 6).',confusionSet:['mult-rule','add-rule','cond-prob']}],
  'rv-mean':[{scenario:'A charity raffle has prizes of $0, $10, and $100 with known probabilities. Find the expected payout per ticket.',confusionSet:['mean','binom-mean','lincomb-mean']}],
  'rv-sd':[{scenario:'Given a probability table for X, how do you measure how far outcomes typically fall from the mean?',confusionSet:['std-dev','binom-sd','lincomb-var']}],
  'binom-pmf':[{scenario:'A quiz has 10 questions with 4 choices each. Find P(exactly 7 correct) by guessing.',confusionSet:['geom-pmf','binom-mean','binom-sd']}],
  'binom-mean':[{scenario:'A manufacturer knows 3% of items are defective. In a batch of 500, how many defects are expected?',confusionSet:['rv-mean','geom-mean','binom-sd']}],
  'binom-sd':[{scenario:'A poll contacts 400 voters where 55% support candidate A. Find the SD of the number who support A.',confusionSet:['binom-mean','rv-sd','std-dev']}],
  'geom-pmf':[{scenario:'A basketball player makes 80% of free throws. Find P(first miss is on the 5th attempt).',confusionSet:['binom-pmf','geom-mean','binom-mean']}],
  'geom-mean':[{scenario:'A telemarketer has a 5% success rate per call. On average, how many calls until the first sale?',confusionSet:['binom-mean','rv-mean','geom-sd']}],
  'geom-sd':[{scenario:'A rare disease test has a 2% positive rate. Find the SD of the number of tests until the first positive.',confusionSet:['geom-mean','binom-sd','rv-sd']}],
  'lincomb-mean':[{scenario:'A store sells phones (mean profit $120) and cases (mean profit $15). Find expected total profit from one of each.',confusionSet:['rv-mean','binom-mean','lintransform']}],
  'lincomb-var':[{scenario:'X and Y are independent. A student needs the variance of X minus Y and is tempted to subtract variances.',confusionSet:['lincomb-mean','rv-sd','lintransform']}],
  'lintransform':[{scenario:'Temperatures are converted from Celsius to Fahrenheit (F = 1.8C + 32). How does the SD change?',confusionSet:['lincomb-mean','lincomb-var','std-dev']}],
  'z-test-stat':[{scenario:'A sample statistic lands 2.4 standard errors above the claimed parameter. Express how extreme this result is as a single standardized number.',confusionSet:['ci-formula','one-prop-z','one-mean-t']}],
  'ci-formula':[{scenario:'A student knows the point estimate and the margin of error and needs to build an interval.',confusionSet:['z-test-stat','margin-error','one-prop-ci']},{scenario:'A student has a point estimate and wants to express her uncertainty as a range of plausible values for the true parameter.',confusionSet:['z-test-stat','margin-error','one-mean-ci']}],
  'power':[{scenario:'A researcher wants to know the probability that her study will detect a real difference if one truly exists.',confusionSet:['type-ii-error','type-i-error','p-value-interp']}],
  'margin-error':[{scenario:'A poll reports 52% support \u00b1 3%. How was that \u00b1 value calculated?',confusionSet:['ci-formula','width-ci','phat-se']}],
  'width-ci':[{scenario:'A researcher wants to halve the \u00b1 term in a poll. By what factor must n increase?',confusionSet:['margin-error','ci-formula','power']}],
  'type-i-error':[{scenario:'A pharmaceutical company runs a trial and concludes the new drug works, but later discovers it performs no better than placebo. What kind of error occurred?',confusionSet:['type-ii-error','p-value-interp','power']}],
  'type-ii-error':[{scenario:'A factory passes inspection even though its defect rate actually exceeds the standard. What kind of error occurred?',confusionSet:['type-i-error','power','p-value-interp']}],
  'p-value-interp':[{scenario:'A student gets p = 0.03 and says "there is a 3% chance H0 is true." Is this correct?',confusionSet:['type-i-error','ci-formula','z-test-stat']},{scenario:'A test yields p = 0.12 at alpha = 0.05. The student must state the correct conclusion.',confusionSet:['type-i-error','type-ii-error','power']}],
  'random-condition':[{scenario:'A researcher uses a random number generator to select 50 households from a city directory. What condition does this sampling method satisfy?',confusionSet:['normal-condition','ten-pct-condition','large-counts']},{scenario:'Volunteers sign up for a study on sleep and grades. Can the results generalize to all students?',confusionSet:['normal-condition','ten-pct-condition','large-counts']},{scenario:'Subjects are randomly assigned to treatment and control groups. What condition does this satisfy?',confusionSet:['normal-condition','ten-pct-condition','large-counts']}],
  'normal-condition':[{scenario:'With n=15 from a strongly skewed population, can you justify using a t-procedure?',confusionSet:['random-condition','large-counts','ten-pct-condition']},{scenario:'With n=150 and p-hat=0.12, check whether a z-procedure for proportions is valid.',confusionSet:['large-counts','random-condition','ten-pct-condition']},{scenario:'A sample of size 45 from unknown population shape. Is CLT applicable for means?',confusionSet:['random-condition','ten-pct-condition','large-counts']}],
  'ten-pct-condition':[{scenario:'A school surveys 80 of its 400 students. Is the independence assumption reasonable?',confusionSet:['random-condition','normal-condition','large-counts']},{scenario:'A researcher samples 500 from a city of 50,000. Does the 10% condition hold?',confusionSet:['random-condition','normal-condition','large-counts']},{scenario:'A biologist captures 30 fish from a pond of 150. Should she worry about dependence?',confusionSet:['random-condition','normal-condition','large-counts']}],
  'large-counts':[{scenario:'With n=40 and p0=0.08, a student checks np0=3.2 before a one-proportion z-test. Is the condition met?',confusionSet:['normal-condition','ten-pct-condition','random-condition']},{scenario:'A survey of 500 finds p-hat=0.92. Check whether a one-proportion CI is valid.',confusionSet:['normal-condition','ten-pct-condition','random-condition']},{scenario:'For a two-proportion z-test, verify large counts using the pooled proportion.',confusionSet:['normal-condition','ten-pct-condition','random-condition']}],
  'phat-mean':[{scenario:'If you take many samples of size 100 from a population with p=0.6, what will the average of all p-hats be?',confusionSet:['xbar-mean','phat-sd','binom-mean']}],
  'phat-sd':[{scenario:'A pollster wants to know how much p-hat varies from sample to sample when p=0.5 and n=400.',confusionSet:['phat-se','phat-mean','xbar-sd']}],
  'phat-se':[{scenario:'A researcher gets p-hat=0.45 from n=200 and needs to quantify the variability of that estimate.',confusionSet:['phat-sd','xbar-se','pooled-se']}],
  'diff-p-sd':[{scenario:'Two populations have known p1=0.6 and p2=0.5. Find the SD of p-hat1 minus p-hat2.',confusionSet:['diff-p-se','diff-x-sd','phat-sd']}],
  'diff-p-se':[{scenario:'Build a CI for p1-p2 and must estimate the SE using the two sample proportions separately.',confusionSet:['pooled-se','diff-p-sd','diff-x-se']}],
  'pooled-se':[{scenario:'A clinical trial compares cure rates in two groups. Under the null hypothesis of equal population proportions, the researcher must quantify the variability of the difference in sample proportions.',confusionSet:['diff-p-se','phat-se','diff-x-se']}],
  'one-prop-z':[{scenario:'A company claims 90% of orders ship on time. A consumer group surveys 200 orders and finds 84%.',confusionSet:['one-prop-ci','two-prop-z','one-mean-t']},{scenario:'A coin is flipped 100 times and lands heads 62 times. Test whether the coin is fair.',confusionSet:['one-prop-ci','two-prop-z','chi-sq']},{scenario:'A school claims 75% graduate. A sample of 150 finds 70%. Is there evidence the rate is lower?',confusionSet:['one-prop-ci','two-prop-z','one-mean-t']}],
  'one-prop-ci':[{scenario:'A survey of 600 voters finds 54% favor a ballot measure. Build a 95% interval for the true value.',confusionSet:['one-prop-z','two-prop-ci','ci-formula']},{scenario:'In a sample of 300 adults, 42% exercise daily. Construct a CI for the true proportion.',confusionSet:['one-prop-z','two-prop-ci','one-mean-ci']}],
  'two-prop-z':[{scenario:'Compare proportion of patients cured by Drug A vs Drug B using independent random samples.',confusionSet:['one-prop-z','two-prop-ci','two-mean-t']},{scenario:'An experiment assigns 100 students to tutoring and 100 to none, comparing pass rates.',confusionSet:['one-prop-z','paired-t','two-mean-t']},{scenario:'Two factories: defect rates 12/200 vs 18/250. Test whether the rates differ.',confusionSet:['one-prop-z','chi-sq','two-prop-ci']}],
  'two-prop-ci':[{scenario:'Estimate how much higher the vaccination rate is in City A than City B.',confusionSet:['two-prop-z','one-prop-ci','two-mean-ci']},{scenario:'After finding different satisfaction rates at two stores, build a 95% CI for the difference.',confusionSet:['two-prop-z','one-prop-ci','two-mean-ci']}],
  'xbar-mean':[{scenario:'If the population mean is 72, what is the mean of all possible sample means?',confusionSet:['phat-mean','mean','binom-mean']}],
  'xbar-sd':[{scenario:'Population SD is 12. For groups of 36, find how much the group averages vary from draw to draw.',confusionSet:['xbar-se','phat-sd','std-dev']}],
  'xbar-se':[{scenario:'A group of 50 has s=8. Quantify the precision of the group average for an interval estimate.',confusionSet:['xbar-sd','phat-se','diff-x-se']}],
  'diff-x-sd':[{scenario:'Two populations have known SDs. Find the SD of x-bar1 minus x-bar2 for independent samples.',confusionSet:['diff-x-se','diff-p-sd','xbar-sd']}],
  'diff-x-se':[{scenario:'Given s1, s2, n1, n2 from two groups, quantify the variability of the gap between group averages.',confusionSet:['diff-x-sd','diff-p-se','xbar-se']}],
  'one-mean-t':[{scenario:'A nutritionist tests whether mean sodium in a soup brand differs from the labeled 800 mg, using 25 cans.',confusionSet:['one-mean-ci','paired-t','two-mean-t']},{scenario:'A school claims mean SAT is 1100. A sample of 40 has mean 1065 and s=120.',confusionSet:['one-mean-ci','one-prop-z','two-mean-t']},{scenario:'A farmer tests whether mean apple weight differs from 150g using 30 apples.',confusionSet:['one-mean-ci','paired-t','two-mean-t']}],
  'one-mean-ci':[{scenario:'A biologist catches 35 fish and measures their lengths. Build a 90% interval for the true average.',confusionSet:['one-mean-t','two-mean-ci','one-prop-ci']},{scenario:'A sample of 20 light bulbs has mean life 1200 hrs with s=80. Build a 95% CI for the mean.',confusionSet:['one-mean-t','two-mean-ci','ci-formula']}],
  'two-mean-t':[{scenario:'Compare mean reaction times for caffeine vs placebo groups with independent random samples.',confusionSet:['paired-t','two-mean-ci','one-mean-t']},{scenario:'Compare mean test scores of students taught with two different methods, using separate classes.',confusionSet:['paired-t','two-prop-z','one-mean-t']},{scenario:'Compare mean recovery times for two surgical techniques using independent patient groups.',confusionSet:['paired-t','two-mean-ci','two-prop-z']}],
  'two-mean-ci':[{scenario:'Build a 95% CI for how much faster Assembly Line A is than Line B, using independent samples.',confusionSet:['two-mean-t','one-mean-ci','two-prop-ci']},{scenario:'Estimate the difference in mean reading scores between two school districts.',confusionSet:['two-mean-t','paired-t','one-mean-ci']}],
  'paired-t':[{scenario:'Each of 20 runners is timed before and after a training program. Test whether times improved.',confusionSet:['two-mean-t','one-mean-t','two-mean-ci']},{scenario:'Students take a pre-test and post-test. Did scores increase on average?',confusionSet:['two-mean-t','one-mean-t','two-prop-z']},{scenario:'Blood pressure measured before and after a medication for 30 patients.',confusionSet:['two-mean-t','one-mean-t','two-mean-ci']}],
  'chi-sq':[{scenario:'A die is rolled 300 times. Test whether outcomes fit a uniform distribution across all six faces.',confusionSet:['expected-gof','one-prop-z','two-prop-z']},{scenario:'A survey cross-classifies 500 adults by education level (HS/BA/grad) and political preference (Dem/Rep/Ind). Test whether preference is independent of education.',confusionSet:['expected-twoway','two-prop-z','cond-prob']},{scenario:'A geneticist compares observed flower-color ratios to a 9:3:3:1 Mendelian prediction.',confusionSet:['expected-gof','binom-pmf','one-prop-z']}],
  'expected-twoway':[{scenario:'In a two-way table of gender by major, find the value a cell should hold if the variables are independent.',confusionSet:['expected-gof','chi-sq','cond-prob']}],
  'expected-gof':[{scenario:'Under H0 the four blood types occur with proportions 0.44, 0.42, 0.10, 0.04 in a sample of 500.',confusionSet:['expected-twoway','chi-sq','binom-mean']}],
  'chi-sq-select':[{scenario:'Before running categorical inference, a student must sort the design into one variable vs a claim, one variable across groups, or two variables from one sample.',confusionSet:['chi-sq-hyp','chi-sq-output','two-prop-z']},{scenario:'An FRQ describes a categorical study, and the first scoring point is deciding which chi-square setup matches the study design.',confusionSet:['chi-sq-hyp','chi-sq-conditions','one-prop-z']}],
  'chi-sq-hyp':[{scenario:'After identifying a categorical procedure, a student now has to write the null and alternative statements in words before interpreting any output.',confusionSet:['p-value-interp','type-i-error','chi-sq-conclude']},{scenario:'A response needs the formal no-difference / no-association claim for a categorical inference procedure.',confusionSet:['p-value-interp','type-i-error','chi-sq-select']}],
  'chi-sq-conditions':[{scenario:'A write-up checks random sampling, approximate independence, and whether every model-based cell count is large enough before trusting the test.',confusionSet:['large-counts','ten-pct-condition','random-condition']},{scenario:'A student is grading whether a categorical inference argument justified randomness, independence, and count assumptions.',confusionSet:['large-counts','ten-pct-condition','random-condition']}],
  'chi-sq-conclude':[{scenario:'After comparing a reported tail probability to alpha, the student must state the decision and explain it in the context of the study.',confusionSet:['p-value-interp','type-i-error','type-ii-error']},{scenario:'A free-response answer needs the correct reject/fail-to-reject language tied back to the variables and populations under study.',confusionSet:['p-value-interp','type-i-error','type-ii-error']}],
  'chi-sq-output':[{scenario:'A calculator printout reports a test statistic, degrees of freedom, and a tail probability. The student must translate that output into a contextual decision.',confusionSet:['chi-sq','df-gof','df-twoway']},{scenario:'A statistics package gives categorical inference output, and the task is to read df, infer table structure, and interpret the p-value.',confusionSet:['chi-sq','df-gof','df-twoway']}],
  'std-resid-chi':[{scenario:'After a significant chi-square result, identify which cells contributed most to the statistic.',confusionSet:['chi-sq','residual','expected-twoway']}],
  'slope-mean':[{scenario:'A statistician imagines drawing thousands of samples and fitting a regression line each time. What does the long-run average of those slopes converge to?',confusionSet:['xbar-mean','phat-mean','slope-b']}],
  'slope-se':[{scenario:'A biologist fits a regression of wing length on body mass for 30 birds and wants to know how precisely the sample slope estimates the true slope.',confusionSet:['slope-sd','xbar-se','phat-se']}],
  'resid-s':[{scenario:'From the sum of squared leftovers after fitting a model and n=25, compute the typical prediction miss.',confusionSet:['std-dev','residual','slope-se']}],
  'slope-t':[{scenario:'Test H0: beta=0 for the relationship between hours studied and exam score.',confusionSet:['one-mean-t','slope-ci','two-mean-t']},{scenario:'Computer output gives b=2.4 and SE_b=0.8. Test whether the slope is significantly nonzero.',confusionSet:['one-mean-t','slope-ci','z-test-stat']},{scenario:'Test whether tree age is a significant linear predictor of trunk diameter.',confusionSet:['corr-r','slope-ci','one-mean-t']}],
  'slope-ci':[{scenario:'After confirming LINE conditions, construct a 95% CI for the true population slope.',confusionSet:['slope-t','one-mean-ci','ci-formula']},{scenario:'Build an interval estimate for how much each additional year of education changes income.',confusionSet:['slope-t','two-mean-ci','one-mean-ci']}],
  'log-transform':[{scenario:'A scatterplot of population vs year shows exponential growth. Linearize the relationship.',confusionSet:['linreg','corr-r','residual']}],
  'slope-sd':[{scenario:'If a population regression exists and you could draw every possible sample, how much would the fitted slopes spread out around the true slope?',confusionSet:['slope-se','xbar-sd','phat-sd']}],
  'df-gof':[{scenario:'A spinner has 5 equally-likely sections. After spinning 200 times and comparing observed counts to expected, how many degrees of freedom does the test use?',confusionSet:['df-twoway','df-t','chi-sq']}],
  'df-twoway':[{scenario:'A 4\u00d73 table of grade level by lunch preference. Find the degrees of freedom.',confusionSet:['df-gof','df-t','chi-sq']}],
  'df-t':[{scenario:'A paired study with 25 subjects. What are the degrees of freedom for the t-test?',confusionSet:['df-gof','df-twoway','one-mean-t']}]
};

// ── Relationship Bank: "what happens when X changes?" questions ──
const RELATIONSHIP_BANK={
  'margin-error':[{input:'n (sample size)',output:'margin of error',direction:'decreases',explain:'n is under a square root in the denominator of SE — larger samples shrink ME'},{input:'confidence level',output:'margin of error',direction:'increases',explain:'Higher confidence requires a larger critical value z* or t*'},{input:'s (sample SD)',output:'margin of error',direction:'increases',explain:'s is in the numerator of SE — more variability widens the interval'}],
  'width-ci':[{input:'n (sample size)',output:'interval width',direction:'decreases',explain:'Width is proportional to 1/\u221an — quadrupling n halves the width'},{input:'confidence level',output:'interval width',direction:'increases',explain:'Higher confidence uses a larger critical value, widening the interval'}],
  'power':[{input:'n (sample size)',output:'power',direction:'increases',explain:'Larger n reduces SE, making it easier to detect a real effect'},{input:'alpha (significance level)',output:'power',direction:'increases',explain:'Larger alpha makes rejection easier, so power increases'},{input:'true effect size',output:'power',direction:'increases',explain:'Bigger true difference from H0 is easier to detect'}],
  'ci-formula':[{input:'confidence level',output:'interval width',direction:'increases',explain:'Higher confidence means larger critical value, so wider interval'},{input:'n (sample size)',output:'interval width',direction:'decreases',explain:'Larger n shrinks SE, narrowing the interval'}],
  'phat-sd':[{input:'n (sample size)',output:'SD of p-hat',direction:'decreases',explain:'n is in the denominator under the square root — larger n reduces spread'}],
  'phat-se':[{input:'n (sample size)',output:'SE of p-hat',direction:'decreases',explain:'n is in the denominator — more data gives a more precise estimate'}],
  'diff-p-sd':[{input:'n1 or n2 (sample sizes)',output:'SD of difference',direction:'decreases',explain:'Each n is in a denominator — larger samples reduce variability'}],
  'diff-p-se':[{input:'n1 or n2 (sample sizes)',output:'SE of difference',direction:'decreases',explain:'Larger samples in either group shrink the standard error'}],
  'one-prop-z':[{input:'n (sample size)',output:'z statistic (magnitude)',direction:'increases',explain:'Larger n shrinks SE in the denominator, amplifying any difference'},{input:'difference (p-hat minus p0)',output:'z statistic (magnitude)',direction:'increases',explain:'Larger gap between observed and null means bigger numerator'}],
  'one-prop-ci':[{input:'n (sample size)',output:'interval width',direction:'decreases',explain:'Larger n reduces SE, narrowing the confidence interval'},{input:'confidence level',output:'interval width',direction:'increases',explain:'Higher confidence uses a larger z*, widening the interval'}],
  'two-prop-z':[{input:'n1 and n2 (sample sizes)',output:'z statistic (magnitude)',direction:'increases',explain:'Larger samples reduce pooled SE, making z larger for the same difference'}],
  'two-prop-ci':[{input:'n1 and n2 (sample sizes)',output:'interval width',direction:'decreases',explain:'Larger samples in each group reduce SE, tightening the interval'},{input:'confidence level',output:'interval width',direction:'increases',explain:'Higher confidence uses a larger z*, widening the interval'}],
  'xbar-sd':[{input:'n (sample size)',output:'SD of x-bar',direction:'decreases',explain:'sigma/sqrt(n) — larger n reduces the spread of sample means'},{input:'sigma (population SD)',output:'SD of x-bar',direction:'increases',explain:'sigma is in the numerator — more variable populations produce more variable means'}],
  'xbar-se':[{input:'n (sample size)',output:'SE of x-bar',direction:'decreases',explain:'s/sqrt(n) — larger n reduces the standard error'},{input:'s (sample SD)',output:'SE of x-bar',direction:'increases',explain:'s is in the numerator — more spread means less precise estimates'}],
  'diff-x-sd':[{input:'n1 or n2 (sample sizes)',output:'SD of difference',direction:'decreases',explain:'Each n is in a denominator under the root — larger samples reduce variability'}],
  'diff-x-se':[{input:'n1 or n2 (sample sizes)',output:'SE of difference',direction:'decreases',explain:'Larger samples in either group shrink the combined SE'}],
  'one-mean-t':[{input:'n (sample size)',output:'t statistic (magnitude)',direction:'increases',explain:'Larger n shrinks s/sqrt(n) in the denominator, increasing |t|'},{input:'s (sample SD)',output:'t statistic (magnitude)',direction:'decreases',explain:'Larger s inflates the denominator SE, reducing |t|'}],
  'one-mean-ci':[{input:'n (sample size)',output:'interval width',direction:'decreases',explain:'Larger n reduces SE and slightly reduces t* (more df)'},{input:'confidence level',output:'interval width',direction:'increases',explain:'Higher confidence uses a larger t*, widening the interval'},{input:'s (sample SD)',output:'interval width',direction:'increases',explain:'s is in the numerator of SE — more spread means wider interval'}],
  'two-mean-t':[{input:'n1 and n2 (sample sizes)',output:'t statistic (magnitude)',direction:'increases',explain:'Larger samples reduce SE in the denominator, making t larger'},{input:'s1 or s2 (sample SDs)',output:'t statistic (magnitude)',direction:'decreases',explain:'Larger SDs inflate the denominator SE, reducing |t|'}],
  'two-mean-ci':[{input:'n1 and n2 (sample sizes)',output:'interval width',direction:'decreases',explain:'Larger samples reduce SE, narrowing the interval'},{input:'confidence level',output:'interval width',direction:'increases',explain:'Higher confidence uses a larger t*, widening the interval'}],
  'paired-t':[{input:'n (number of pairs)',output:'t statistic (magnitude)',direction:'increases',explain:'More pairs reduce s_d/sqrt(n), increasing |t|'},{input:'s_d (SD of differences)',output:'t statistic (magnitude)',direction:'decreases',explain:'More variability in differences inflates the denominator'}],
  'chi-sq':[{input:'n (sample size)',output:'chi-square statistic',direction:'increases',explain:'Larger n increases expected counts, amplifying (O-E)\u00b2/E terms'},{input:'difference (O minus E)',output:'chi-square statistic',direction:'increases',explain:'Each (O-E)\u00b2/E term grows with larger discrepancies from expected'}],
  'chi-sq-conditions':[{input:'expected counts',output:'validity of the chi-square approximation',direction:'decreases',explain:'Smaller expected counts make the chi-square approximation less reliable'}],
  'chi-sq-output':[{input:'chi-square statistic (holding df constant)',output:'p-value',direction:'decreases',explain:'For fixed degrees of freedom, larger chi-square values push farther into the right tail and produce smaller p-values'}],
  'slope-sd':[{input:'n (sample size)',output:'SD of slope b',direction:'decreases',explain:'sqrt(n) is in the denominator — more data gives more precise slopes'},{input:'sigma (residual SD)',output:'SD of slope b',direction:'increases',explain:'sigma in numerator — more noise means less precise slopes'},{input:'sigma_x (spread of x)',output:'SD of slope b',direction:'decreases',explain:'sigma_x in denominator — more spread in x anchors the slope'}],
  'slope-se':[{input:'n (sample size)',output:'SE of slope b',direction:'decreases',explain:'sqrt(n-1) in denominator — more data reduces slope uncertainty'},{input:'s (residual SD)',output:'SE of slope b',direction:'increases',explain:'s in numerator — noisier data gives a less precise slope'},{input:'s_x (spread of x)',output:'SE of slope b',direction:'decreases',explain:'s_x in denominator — wider x range pins down the slope better'}],
  'slope-t':[{input:'n (sample size)',output:'t statistic (magnitude)',direction:'increases',explain:'Larger n reduces SE_b in the denominator, making t larger'},{input:'s (residual SD)',output:'t statistic (magnitude)',direction:'decreases',explain:'More residual noise inflates SE_b, reducing |t|'}],
  'slope-ci':[{input:'n (sample size)',output:'interval width',direction:'decreases',explain:'Larger n reduces SE_b, narrowing the CI for the slope'},{input:'confidence level',output:'interval width',direction:'increases',explain:'Higher confidence uses a larger t*, widening the interval'}],
  'resid-s':[{input:'sum of squared residuals',output:'residual SD (s)',direction:'increases',explain:'Larger residuals mean worse fit, so s increases'},{input:'n (sample size)',output:'residual SD (s)',direction:'decreases',explain:'Dividing by n-2 means more data dilutes the sum of squares'}],
  'std-dev':[{input:'distance of values from the mean',output:'standard deviation',direction:'increases',explain:'SD measures average distance from the mean — farther values increase it'}],
  'corr-r':[{input:'spread around the line',output:'r (magnitude)',direction:'decreases',explain:'More scatter reduces the consistency of z-score products'}],
  'slope-b':[{input:'r (correlation)',output:'slope b',direction:'increases',explain:'b = r * sy/sx — stronger correlation means steeper slope'},{input:'sy/sx (ratio of SDs)',output:'slope b',direction:'increases',explain:'Larger y-variability relative to x makes the slope steeper'}],
  'binom-mean':[{input:'n (number of trials)',output:'mean (mu)',direction:'increases',explain:'mu = np — more trials means more expected successes'},{input:'p (success probability)',output:'mean (mu)',direction:'increases',explain:'mu = np — higher p means more expected successes per trial'}],
  'binom-sd':[{input:'n (number of trials)',output:'sigma',direction:'increases',explain:'sigma = sqrt(np(1-p)) — more trials add variability'}],
  'geom-mean':[{input:'p (success probability)',output:'mean (mu)',direction:'decreases',explain:'mu = 1/p — higher p means fewer trials needed on average'}],
  'geom-sd':[{input:'p (success probability)',output:'sigma',direction:'decreases',explain:'Both sqrt(1-p) and 1/p decrease as p increases'}]
};

const AUTO_BLANK_SPECS=[
  {match:'\\sigma_{\\hat{p}_1-\\hat{p}_2}',choices:['\\sigma_{\\hat{p}_1-\\hat{p}_2}','s_{\\hat{p}_1-\\hat{p}_2}','\\sigma_{\\bar{x}_1-\\bar{x}_2}']},
  {match:'s_{\\hat{p}_1-\\hat{p}_2}',choices:['s_{\\hat{p}_1-\\hat{p}_2}','\\sigma_{\\hat{p}_1-\\hat{p}_2}','s_{\\bar{x}_1-\\bar{x}_2}']},
  {match:'\\sigma_{\\bar{x}_1-\\bar{x}_2}',choices:['\\sigma_{\\bar{x}_1-\\bar{x}_2}','s_{\\bar{x}_1-\\bar{x}_2}','\\sigma_{\\hat{p}_1-\\hat{p}_2}']},
  {match:'s_{\\bar{x}_1-\\bar{x}_2}',choices:['s_{\\bar{x}_1-\\bar{x}_2}','\\sigma_{\\bar{x}_1-\\bar{x}_2}','s_{\\hat{p}_1-\\hat{p}_2}']},
  {match:'\\mu_{\\hat{p}}',choices:['\\mu_{\\hat{p}}','\\sigma_{\\hat{p}}','\\hat{p}']},
  {match:'\\sigma_{\\hat{p}}',choices:['\\sigma_{\\hat{p}}','s_{\\hat{p}}','\\mu_{\\hat{p}}']},
  {match:'s_{\\hat{p}}',choices:['s_{\\hat{p}}','\\sigma_{\\hat{p}}','\\mu_{\\hat{p}}']},
  {match:'\\mu_{\\bar{x}}',choices:['\\mu_{\\bar{x}}','\\sigma_{\\bar{x}}','\\bar{x}']},
  {match:'\\sigma_{\\bar{x}}',choices:['\\sigma_{\\bar{x}}','s_{\\bar{x}}','\\mu_{\\bar{x}}']},
  {match:'s_{\\bar{x}}',choices:['s_{\\bar{x}}','\\sigma_{\\bar{x}}','\\mu_{\\bar{x}}']},
  {match:'\\mu_b',choices:['\\mu_b','\\sigma_b','b']},
  {match:'\\sigma_b',choices:['\\sigma_b','s_b','\\beta']},
  {match:'s_b',choices:['s_b','\\sigma_b','s']},
  {match:'\\mu_X',choices:['\\mu_X','\\sigma_X','\\mu']},
  {match:'\\sigma_X',choices:['\\sigma_X','\\mu_X','\\sigma']},
  {match:'\\mu_Y',choices:['\\mu_Y','\\sigma_Y','\\mu_X']},
  {match:'\\sigma_Y',choices:['\\sigma_Y','\\mu_Y','\\sigma_X']},
  {match:'\\chi^2',choices:['\\chi^2','z','t']},
  {match:'r^2',choices:['r^2','r','b']},
  {match:'\\text{Power}',choices:['\\text{Power}','\\beta','\\alpha']},
  {match:'\\text{Width}',choices:['\\text{Width}','ME','SE']},
  {match:'\\text{residual}',choices:['\\text{residual}','\\hat{y}','y']},
  {match:'\\text{critical value}',choices:['\\text{critical value}','SE','\\text{statistic}']},
  {match:'\\text{statistic}',choices:['\\text{statistic}','\\text{parameter}','SE']},
  {regex:/(?<![A-Za-z])IQR(?![A-Za-z])/u,answer:'IQR',choices:['IQR','Q_3','Q_1']},
  {regex:/(?<![A-Za-z])df(?![A-Za-z])/u,answer:'df',choices:['df','n','k']},
  {regex:/(?<![A-Za-z])ME(?![A-Za-z])/u,answer:'ME',choices:['ME','SE','\\alpha']},
  {regex:/(?<![A-Za-z])SE(?![A-Za-z])/u,answer:'SE',choices:['SE','\\sigma','s']},
  {regex:/(?<![A-Za-z])E(?![A-Za-z])/u,answer:'E',choices:['E','O','n']},
  {match:'\\text{grand total}',choices:['\\text{grand total}','n','\\text{row total}']},
  {match:'\\hat{p}_c',choices:['\\hat{p}_c','\\hat{p}_1','p_1']},
  {match:'\\hat{p}_1',choices:['\\hat{p}_1','p_1','\\hat{p}_c']},
  {match:'\\hat{p}_2',choices:['\\hat{p}_2','p_2','\\hat{p}_c']},
  {match:'p_0',choices:['p_0','\\hat{p}','p']},
  {match:'\\beta_0',choices:['\\beta_0','\\beta','b']},
  {match:'\\mu_0',choices:['\\mu_0','\\mu','\\bar{x}']},
  {match:'\\sqrt{n}',choices:['\\sqrt{n}','n','n^2']},
  {match:'1-p',choices:['1-p','p','n']},
  {match:'x-1',choices:['x-1','x','x+1']},
  {match:'1.5',choices:['1.5','2','1']},
  {match:'68',choices:['68','95','99.7']},
  {match:'95',choices:['95','68','99.7']},
  {match:'P(A \\cap B)',choices:['P(A\\cap B)','P(A\\cup B)','P(A)P(B)']},
  {match:'P(B|A)',choices:['P(B|A)','P(B)','P(A|B)']},
  {match:'P(B)',choices:['P(B)','P(A)','P(A\\cup B)']},
  {match:'Q_3',choices:['Q_3','Q_2','Q_1']},
  {match:'Q_1',choices:['Q_1','Q_2','\\bar{x}']},
  {match:'(c-1)',choices:['(c-1)','c','(r-1)']},
  {match:'|b|',choices:['|b|','b','a+b']},
  {match:'b^2',choices:['b^2','b','-b^2']},
  {match:'s_y',choices:['s_y','s_x','\\sigma_y']},
  {match:'s_x',choices:['s_x','s_y','\\sigma_x']},
  {match:'n_1',choices:['n_1','n_2','n']},
  {match:'n_2',choices:['n_2','n_1','p_2']},
  {match:'n-2',choices:['n-2','n-1','n']},
  {match:'n-1',choices:['n-1','n','n+1']},
  {regex:/\\hat\{p\}(?!_)/u,answer:'\\hat{p}',choices:['\\hat{p}','p','p_0']},
  {regex:/\\bar\{x\}(?!_)/u,answer:'\\bar{x}',choices:['\\bar{x}','x','\\mu']},
  {regex:/\\bar\{y\}(?!_)/u,answer:'\\bar{y}',choices:['\\bar{y}','\\hat{y}','y']},
  {regex:/\\hat\{y\}(?!_)/u,answer:'\\hat{y}',choices:['\\hat{y}','\\bar{y}','y']},
  {regex:/(?<![_\w])z(?![_\w])/u,answer:'z',choices:['z','t','\\chi^2']},
  {regex:/(?<![_\w])s(?![_\w])/u,answer:'s',choices:['s','\\sigma','SE']},
  {regex:/(?<![_\w-])n(?![_\w-])/u,answer:'n',choices:['n','n-1','n+1']},
  {regex:/(?<![_\w])\\sigma(?![_\w])/u,answer:'\\sigma',choices:['\\sigma','s','\\mu']},
  {regex:/(?<![_\w])\\mu(?![_\w])/u,answer:'\\mu',choices:['\\mu','\\bar{x}','\\sigma']},
];
function replaceFirstLiteral(text,needle,replacement){
  const idx=text.indexOf(needle);
  if(idx===-1)return null;
  return text.slice(0,idx)+replacement+text.slice(idx+needle.length);
}
function replaceFirstRegexMatch(text,regex,replacement){
  const match=text.match(regex);
  if(!match||match.index==null)return null;
  return text.slice(0,match.index)+replacement+text.slice(match.index+match[0].length);
}
function normalizeBlankConcept(value){
  return normalizeExplanationLookup(formatExplanationLabel(String(value||'')));
}
function buildAutoBlankVariants(cmd){
  if(!cmd||!cmd.latex)return[];
  const seenConcepts=new Set((cmd.blanks||[]).map(blank=>normalizeBlankConcept(blank.answer)));
  const seenLatex=new Set((cmd.blanks||[]).map(blank=>blank.latex));
  const variants=[];
  for(const spec of AUTO_BLANK_SPECS){
    const answer=spec.answer||spec.match;
    const conceptKey=normalizeBlankConcept(answer);
    if(seenConcepts.has(conceptKey))continue;
    const blankLatex=spec.match
      ?replaceFirstLiteral(cmd.latex,spec.match,'\\boxed{\\,?\\,}')
      :replaceFirstRegexMatch(cmd.latex,spec.regex,'\\boxed{\\,?\\,}');
    if(!blankLatex||blankLatex===cmd.latex||seenLatex.has(blankLatex))continue;
    variants.push({latex:blankLatex,answer:answer,choices:spec.choices.slice(0,3)});
    seenConcepts.add(conceptKey);
    seenLatex.add(blankLatex);
    if(variants.length>=3)break;
  }
  return variants;
}
function expandFormulaBlankCoverage(cartridge){
  cartridge.commands.forEach(cmd=>{
    if(!Array.isArray(cmd.blanks))cmd.blanks=[];
    cmd.blanks=cmd.blanks.concat(buildAutoBlankVariants(cmd));
  });
}
expandFormulaBlankCoverage(AP_STATS_CARTRIDGE);

function stripAnswerLabel(label){
  return String(label||'').replace(/\s*\([^)]*\)\s*$/,'').trim();
}
function ensureSentence(text){
  const trimmed=String(text||'').trim();
  if(!trimmed)return'';
  return /[.!?]$/.test(trimmed)?trimmed:trimmed+'.';
}
function formatExplanationLabel(label){
  return String(label||'')
    .replace(/\\text\{([^}]*)\}/g,'$1')
    .replace(/\\sqrt\{([^}]*)\}/g,'sqrt($1)')
    .replace(/\\hat\{p_1\}/g,'p-hat1')
    .replace(/\\hat\{p\}/g,'p-hat')
    .replace(/\\bar\{x\}/g,'x-bar')
    .replace(/\\beta/g,'beta')
    .replace(/\\mu/g,'mu')
    .replace(/\\sigma/g,'sigma')
    .replace(/\\chi/g,'chi')
    .replace(/\\cdot/g,' ')
    .replace(/\^\*/g,'*')
    .replace(/[{}]/g,'')
    .replace(/\s+/g,' ')
    .trim();
}
function normalizeExplanationLookup(label){
  const raw=formatExplanationLabel(label).toLowerCase();
  const aliases={
    'phat':'p-hat','p-hat':'p-hat','phat1':'p-hat1','p-hat1':'p-hat1',
    'xbar':'x-bar','x-bar':'x-bar','mu0':'mu0','beta0':'beta0','p0':'p0',
    'pc':'pc','sigma_x':'sigma_x','sx':'s','s_x':'s','sy':'s','s_y':'s',
    'sigma1^2':'sigma1^2','s1^2':'s1^2','z* or t*':'z* or t*'
  };
  return aliases[raw]||raw;
}
const EXPLANATION_GLOSSARY=[
  {keys:['1'],title:'1',lines:[
    'The number 1 usually marks a full probability or the single parameter lost to a constraint.',
    'Use it when a rule says probabilities must add to 1 or a formula subtracts one degree of freedom.',
    'Spot it in Algebra 2 whenever you see a leftover category or a sum-to-one condition.'
  ]},
  {keys:['1-p'],title:'1 - p',lines:[
    '1 - p is the complement of a proportion p, so it is the chance of not seeing the event.',
    'Use it in Bernoulli and sampling formulas when you need both successes and failures.',
    'Spot it in standard deviation formulas for proportions because spread depends on p times 1 - p.'
  ]},
  {keys:['1.5'],title:'1.5 × IQR',lines:[
    '1.5 times the IQR is the standard boxplot cutoff for flagging possible outliers.',
    'Use it when building the lower and upper fences around Q1 and Q3.',
    'Spot it whenever a prompt asks whether a value is an outlier by the boxplot rule.'
  ]},
  {keys:['95'],title:'95%',lines:[
    '95 percent is the Empirical Rule benchmark for values within about two standard deviations in a Normal model.',
    'Use it when the question references the middle bulk of a Normal distribution.',
    'Spot it alongside 68 percent and 99.7 percent in quick Normal-distribution reasoning.'
  ]},
  {keys:['e'],title:'Expected count',lines:[
    'An expected count is the count predicted by the null model before you compare it to the data.',
    'Use it in chi-square work to measure how far observed counts are from what independence or a stated distribution would predict.',
    'Spot it in formulas that divide by expected count or ask whether expected counts are large enough.'
  ]},
  {keys:['p(a∩b)'],title:'P(A ∩ B)',lines:[
    'P(A ∩ B) is the probability that events A and B both happen together.',
    'Use it for joint probability questions and for multiplying conditional and base probabilities.',
    'Spot the intersection symbol whenever the prompt says both, and, or simultaneously.'
  ]},
  {keys:['p(b)'],title:'P(B)',lines:[
    'P(B) is the overall probability that event B happens.',
    'Use it as the denominator in conditional probability when you are restricting attention to outcomes in B.',
    'Spot it when the problem asks for the chance of B with no extra conditions attached.'
  ]},
  {keys:['p(b|a)'],title:'P(B | A)',lines:[
    'P(B | A) is the conditional probability that B happens given that A has already happened.',
    'Use it when the sample space has been narrowed to cases where A is true.',
    'Spot the vertical bar as a given or assuming signal.'
  ]},
  {keys:['p(xi)'],title:'P(x_i)',lines:[
    'P(x_i) is the probability attached to a single outcome x_i of a discrete random variable.',
    'Use it in expected value and variance formulas for discrete distributions.',
    'Spot it when a table lists possible x values and a probability next to each one.'
  ]},
  {keys:['q1'],title:'Q1',lines:[
    'Q1 is the first quartile, so it marks the 25th percentile of the distribution.',
    'Use it when describing spread with the IQR or building boxplot fences.',
    'Spot it as the lower quartile in summaries written as Q1, median, and Q3.'
  ]},
  {keys:['se'],title:'SE',lines:[
    'SE stands for standard error, the estimated standard deviation of a sample statistic.',
    'Use it to measure sampling variability in confidence intervals and hypothesis tests.',
    'Spot it in inference formulas that attach a critical value to the variability of a statistic.'
  ]},
  {keys:['b'],title:'b',lines:[
    'b usually represents the slope of the least-squares regression line in Algebra 2.',
    'Use it when the question asks how much predicted y changes for a one-unit increase in x.',
    'Spot it in y-hat = a + bx or in slope standard deviation rules.'
  ]},
  {keys:['b^2'],title:'b squared',lines:[
    'b squared means the slope is multiplied by itself.',
    'Use it in variance transformations because variances scale by the square of the multiplier.',
    'Spot it when spread is being transformed after multiplying the original variable by a constant b.'
  ]},
  {keys:['beta'],title:'beta',lines:[
    'Beta is the probability of a Type II error.',
    'Use it when the question asks about failing to reject a false null hypothesis.',
    'Spot it next to power because power equals 1 minus beta.'
  ]},
  {keys:['beta0'],title:'beta zero',lines:[
    'Beta zero is the population regression intercept parameter in the model Y = \u03b2\u2080 + \u03b2\u2081X + \u03b5.',
    'Use it when a regression formula refers to the true y-intercept, not the sample estimate a.',
    'Spot the subscript zero as the intercept term; the slope parameter is \u03b2\u2081.'
  ]},
  {keys:['grand total'],title:'Grand total',lines:[
    'The grand total is the overall sample size across every cell in a two-way table.',
    'Use it when computing expected counts from row totals and column totals.',
    'Spot it as the single total that sits at the corner of the table.'
  ]},
  {keys:['mu'],title:'mu',lines:[
    'Mu is the population mean.',
    'Use it when the question is talking about the true average for the full population rather than a sample statistic.',
    'Spot the Greek letter mu whenever a formula names the parameter for center.'
  ]},
  {keys:['mu0'],title:'mu zero',lines:[
    'Mu zero is the hypothesized population mean under the null hypothesis.',
    'Use it in one-sample t procedures when the test compares x-bar to a claimed mean.',
    'Spot the zero subscript whenever the formula is centering around the null value.'
  ]},
  {keys:['n'],title:'n',lines:[
    'n is the sample size.',
    'Use it whenever a formula needs to know how many observations or trials are in the sample.',
    'Spot it most often under a square root because larger samples reduce sampling variability.'
  ]},
  {keys:['n-1'],title:'n - 1',lines:[
    'n minus 1 is the sample-size adjustment used when a statistic loses one degree of freedom.',
    'Use it in sample variance and standard deviation formulas after estimating the sample mean.',
    'Spot it whenever the data are centered around x-bar instead of the true population mean.'
  ]},
  {keys:['n-2'],title:'n - 2',lines:[
    'n minus 2 is the degrees of freedom for simple linear regression slope inference.',
    'Use it when a t model is testing or estimating the slope from paired x and y data.',
    'Spot it because regression estimates two parameters, the intercept and the slope.'
  ]},
  {keys:['n2'],title:'n2',lines:[
    'n2 is the sample size from the second group in a two-sample setting.',
    'Use it when comparing two means or two proportions and each group has its own sample size.',
    'Spot the subscript 2 as the marker for the second sample.'
  ]},
  {keys:['p'],title:'p',lines:[
    'p is the population proportion parameter.',
    'Use it when the question is talking about the true long-run proportion in the population.',
    'Spot it in proportion formulas that later replace p with p-hat when the parameter is estimated.'
  ]},
  {keys:['p0'],title:'p zero',lines:[
    'p zero is the hypothesized population proportion under the null hypothesis.',
    'Use it in one-proportion tests and expected-count calculations under H0.',
    'Spot the zero subscript whenever the formula is using the null model rather than the sample estimate.'
  ]},
  {keys:['pc'],title:'pooled proportion',lines:[
    'p-sub-c is the pooled sample proportion formed by combining successes across both groups.',
    'Use it in a two-proportion z test when the null says the population proportions are equal.',
    'Spot it in the standard error for two-proportion hypothesis tests, not confidence intervals.'
  ]},
  {keys:['p-hat'],title:'p-hat',lines:[
    'p-hat is the sample proportion.',
    'Use it when the data give a sample-based estimate of the population proportion p.',
    'Spot the hat as the visual cue that this is a statistic, not a population parameter.'
  ]},
  {keys:['p-hat1'],title:'p-hat1',lines:[
    'p-hat1 is the sample proportion from the first group.',
    'Use it in two-sample proportion problems when you need the estimate from group 1 by itself.',
    'Spot the 1 subscript as the label for the first sample or treatment group.'
  ]},
  {keys:['r'],title:'r',lines:[
    'r is the correlation coefficient.',
    'Use it when the question is measuring the direction and strength of a linear relationship between two quantitative variables.',
    'Spot it as a number between -1 and 1 that talks about linear association, not slope.'
  ]},
  {keys:['s','sy'],title:'s',lines:[
    's is the sample standard deviation.',
    'Use it when the spread is being estimated from sample data and the population standard deviation is unknown.',
    'Spot it in t procedures, where sample spread replaces the unknown sigma.'
  ]},
  {keys:['s1^2'],title:'s1 squared',lines:[
    's1 squared is the sample variance from group 1.',
    'Use it in two-sample mean procedures when each sample contributes its own variance estimate.',
    'Spot the square to remember this is variance, not standard deviation.'
  ]},
  {keys:['sigma'],title:'sigma',lines:[
    'Sigma is the population standard deviation.',
    'Use it when the formula is describing true spread in the population or a model with known variability.',
    'Spot the Greek sigma whenever a prompt refers to the parameter for spread.'
  ]},
  {keys:['sigma1^2'],title:'sigma1 squared',lines:[
    'Sigma1 squared is the population variance for group 1.',
    'Use it in theoretical variance formulas for two-sample settings before sample estimates are substituted in.',
    'Spot the square as the cue that the quantity measures variance.'
  ]},
  {keys:['sigma_x'],title:'sigma_x',lines:[
    'Sigma sub x is the standard deviation of the explanatory variable x.',
    'Use it in regression and linear-transformation formulas that talk about spread in x.',
    'Spot the x subscript to distinguish it from the spread of y.'
  ]},
  {keys:['sqrt(n)'],title:'square root of n',lines:[
    'Square root of n captures how sampling variability shrinks as sample size grows.',
    'Use it in standard error formulas and sample-size tradeoff rules.',
    'Spot it in denominators because larger samples reduce variability, but with diminishing returns.'
  ]},
  {keys:['x-1'],title:'x - 1',lines:[
    'x minus 1 is the centered distance from a value x to the number 1.',
    'Use it in geometric settings where the count starts at 1 and probabilities decay after that first success.',
    'Spot it when a distribution formula needs the number of failures before the first success.'
  ]},
  {keys:['x-bar'],title:'x-bar',lines:[
    'x-bar is the sample mean.',
    'Use it as the sample-based estimate of the population mean mu.',
    'Spot the bar as the notation for an average computed from sample data.'
  ]},
  {keys:['yhat'],title:'y-hat',lines:[
    'y-hat is the predicted response value from the regression line.',
    'Use it when the problem asks for the model’s predicted y at a given x.',
    'Spot the hat as the sign that this is a fitted value from the line, not an observed value.'
  ]},
  {keys:['z* or t*'],title:'critical value',lines:[
    'z-star or t-star is the critical value that sets the confidence level.',
    'Use it when building a margin of error for an interval estimate.',
    'Spot the star notation as the multiplier sitting in front of the standard error.'
  ]},
  {keys:['|b|'],title:'absolute value of b',lines:[
    'Absolute value of b means the positive size of the multiplier b without its sign.',
    'Use it in standard deviation transformations because spread cannot be negative.',
    'Spot the vertical bars whenever the formula cares about magnitude but not direction.'
  ]}
];
function buildGlossaryEntry(spec){
  return{title:spec.title,lines:spec.lines.map(ensureSentence)};
}
function buildExplanationBank(commands){
  const byId={},byLabel={};
  commands.forEach(cmd=>{
    const label=stripAnswerLabel(cmd.action);
    const entry={
      id:cmd.id,
      title:label,
      lines:[
        ensureSentence(cmd.explain||(`${label} is an Algebra 2 idea from this deck`)),
        ensureSentence('Use it when the question is asking for the '+label.toLowerCase()),
        ensureSentence('Spot it by remembering: '+cmd.hint)
      ]
    };
    byId[cmd.id]=entry;
    byLabel[normalizeExplanationLookup(label)]=entry;
  });
  EXPLANATION_GLOSSARY.forEach(spec=>{
    const entry=buildGlossaryEntry(spec);
    spec.keys.forEach(key=>{byLabel[normalizeExplanationLookup(key)]=entry});
  });
  return{byId,byLabel};
}


// Domain → Unit/Topic label mapping (Algebra 2 2026 curriculum)
const DOM_LABELS={
  'descriptive':['U1 · Describing Data','U2 · Two-Variable Data','U1 · Summary Stats','U2 · Regression'],
  'probability':['U4 · Probability Rules','U4 · Events & Prob'],
  'distributions':['U4 · Random Variables','U4 · Distributions','U4 · Binomial/Geometric'],
  'inference':['U5–6 · Inference','U6 · Hypothesis Tests'],
  'chi-square':['U8 · Chi-Square','U8 · Categorical Inference'],
  'inf-proportions':['U5 · Sampling Dist.','U6 · Proportions','U6 · Two Proportions'],
  'inf-means':['U5 · Sampling Dist.','U7 · Means','U7 · Two Means'],
  'regression':['U9 · Slope Inference','U9 · Regression Slope'],
};

// Shared L2+ nodes — hand-authored, added to PREREQ_DAG
// These will be wired into L1 nodes' prereqs arrays incrementally
const SHARED_PREREQ_NODES={
  'se-concept':{id:'se-concept',type:'conceptual',level:2,
    q:'What does Standard Error measure?',correct:'How much a statistic varies across repeated samples',
    wrong:['The average error in each measurement','The distance between sample and population'],prereqs:['sampling-variability','variance-to-sd','sqrt-n-effect']},
  'sampling-variability':{id:'sampling-variability',type:'conceptual',level:3,
    q:'Why do different random samples give different statistics?',correct:'Random selection creates natural variation',
    wrong:['Measurement error','Biased sampling methods'],prereqs:['random-selection','whole-vs-part']},
  'sqrt-n-effect':{id:'sqrt-n-effect',type:'computational',level:2,
    q:'If SD=10 and n=25, what is SD/\u221an?',correct:'2',
    wrong:['0.4','5'],prereqs:['sqrt-compute','division-concept']},
  'sqrt-compute':{id:'sqrt-compute',type:'computational',level:3,
    q:'\u221a25 = ?',correct:'5',wrong:['12.5','25'],prereqs:['perfect-squares','square-number']},
  'perfect-squares':{id:'perfect-squares',type:'computational',level:4,
    q:'5 \u00d7 5 = ?',correct:'25',wrong:['10','20'],prereqs:['multiply-numbers']},
  'division-concept':{id:'division-concept',type:'conceptual',level:3,
    q:'What does dividing by a number do?',correct:'Splits a total into equal parts',
    wrong:['Multiplies by the reciprocal always','Removes the number'],prereqs:['equal-sharing','fraction-concept']},
  'df-concept':{id:'df-concept',type:'conceptual',level:2,
    q:'What does degrees of freedom measure?',correct:'Number of values free to vary',
    wrong:['The sample size','The number of variables'],prereqs:['constraint-concept','why-subtract-one']},
  'proportion-arithmetic':{id:'proportion-arithmetic',type:'computational',level:2,
    q:'If p=0.4, what is p(1-p)?',correct:'0.24',wrong:['0.6','0.16'],prereqs:['complement-concept','prob-multiply','max-variability']},
  'complement-concept':{id:'complement-concept',type:'conceptual',level:3,
    q:'What is the complement of probability p?',correct:'1 - p',wrong:['p\u00b2','1/p'],prereqs:['subtract-from-whole','part-of-whole']},
  'z-score-concept':{id:'z-score-concept',type:'conceptual',level:2,
    q:'What does a z-score measure?',correct:'How many SDs a value is from the mean',
    wrong:['The percentile rank','The raw deviation'],prereqs:['subtraction-for-deviation','ratio-for-comparison']},
  'variance-to-sd':{id:'variance-to-sd',type:'conceptual',level:2,
    q:'Why take the square root of variance?',correct:'To convert back to original units',
    wrong:['To make the value smaller','To normalize the distribution'],prereqs:['sqrt-compute','squaring-concept','variability-emphasis']},
  'squaring-concept':{id:'squaring-concept',type:'conceptual',level:3,
    q:'Why square deviations before averaging?',correct:'To emphasize larger deviations and prevent positive/negative canceling',
    wrong:['To make all values integers','To amplify outliers'],prereqs:['exponent-concept','self-multiply']},
  'mean-concept':{id:'mean-concept',type:'conceptual',level:2,
    q:'What does the mean (average) represent?',correct:'The balance point of a distribution',
    wrong:['The most common value','The middle value when sorted'],prereqs:['summation-concept','division-concept']},
  'unbiased-estimator':{id:'unbiased-estimator',type:'conceptual',level:2,
    q:'What does "unbiased estimator" mean?',correct:'On average equals the true parameter',
    wrong:['Always exactly correct','Has no variance'],prereqs:['parameter-concept','mean-concept','sample-vs-population']},
  'independence-concept':{id:'independence-concept',type:'conceptual',level:2,
    q:'What does independence of events mean?',correct:'One event does not affect the other\'s probability',
    wrong:['Events never happen together','Events have equal probability'],prereqs:['basic-probability','with-replacement-example']},
  'conditional-restrict':{id:'conditional-restrict',type:'conceptual',level:2,
    q:'What does "given B" mean in P(A|B)?',correct:'Restrict to only outcomes where B occurred',
    wrong:['B happens after A','B causes A'],prereqs:['subset-concept','basic-probability']},
  'expected-value-concept':{id:'expected-value-concept',type:'conceptual',level:2,
    q:'What is expected value?',correct:'The long-run average of a random variable',
    wrong:['The most likely outcome','The median outcome'],prereqs:['probability-weight','mean-concept']},
  'clt-concept':{id:'clt-concept',type:'conceptual',level:2,
    q:'What does the Central Limit Theorem guarantee?',correct:'Sample means are approximately Normal for large n',
    wrong:['All populations are Normal','Samples are always representative'],prereqs:['distribution-shape','sample-size-effect','normal-approx']},
  'hypothesis-framework':{id:'hypothesis-framework',type:'conceptual',level:2,
    q:'What does a test statistic measure?',correct:'How far the observed result is from what H0 predicts in standardized units',
    wrong:['The probability H0 is true','The effect size'],prereqs:['se-concept','z-score-concept','parameter-concept']},
  // ── Additional L2-L3 nodes for deeper coverage ──
  'summation-concept':{id:'summation-concept',type:'conceptual',level:3,
    q:'What does the \u03a3 (sigma) symbol mean?',correct:'Add up all the values',
    wrong:['Multiply all values','Find the largest value'],prereqs:['list-addition','count-items','number-line-concept']},
  'critical-value-concept':{id:'critical-value-concept',type:'conceptual',level:2,
    q:'What is a critical value (z* or t*)?',correct:'The cutoff from the reference distribution for a given confidence level',
    wrong:['The sample mean','The standard error'],prereqs:['z-score-concept','distribution-shape','interval-concept']},
  'chi-square-design':{id:'chi-square-design',type:'conceptual',level:2,
    q:'How do the three chi-square tests differ by design?',correct:'GOF = one variable vs a claimed distribution; homogeneity = one variable across populations; independence = two variables in one population',
    wrong:['They use different formulas','Only one of them uses expected counts'],prereqs:['sample-vs-population','independence-concept','observed-vs-expected']},
  'back-transform-concept':{id:'back-transform-concept',type:'conceptual',level:2,
    q:'How do you convert a prediction on a log scale back to the original scale?',correct:'Exponentiate the fitted value to undo the log transform',
    wrong:['Take the log again','Subtract the slope'],prereqs:['exponent-concept','distribution-shape']},
  'interval-concept':{id:'interval-concept',type:'conceptual',level:3,
    q:'What does \u00b1 create on a number line?',correct:'A range of values centered on a point',
    wrong:['A single exact value','Two separate points'],prereqs:['number-line-concept','subtract-from-whole']},
  'observed-vs-expected':{id:'observed-vs-expected',type:'conceptual',level:2,
    q:'What is the difference between observed and expected counts?',correct:'Observed = actual data; Expected = what H0 predicts',
    wrong:['They are the same thing','Observed is always larger'],prereqs:['subtraction-for-deviation','parameter-concept']},
  'double-counting':{id:'double-counting',type:'conceptual',level:3,
    q:'If you add P(A) + P(B), what might go wrong?',correct:'Events in both A and B get counted twice',
    wrong:['The result exceeds 1','You lose independent events'],prereqs:['venn-overlap','list-addition']},
  'probability-weight':{id:'probability-weight',type:'conceptual',level:3,
    q:'Why multiply each outcome by its probability?',correct:'To weight outcomes by how likely they are',
    wrong:['To normalize values','To convert to percentages'],prereqs:['part-of-whole','self-multiply']},
  'pooling-concept':{id:'pooling-concept',type:'conceptual',level:2,
    q:'What does pooling two samples mean?',correct:'Combining data to get a single shared estimate',
    wrong:['Averaging the sample sizes','Discarding the smaller sample'],prereqs:['weighted-average','sample-vs-population','mean-concept']},
  'sample-vs-population':{id:'sample-vs-population',type:'conceptual',level:3,
    q:'What is the difference between a sample and a population?',correct:'A sample is a subset; the population is everyone',
    wrong:['They are the same thing','A sample is always larger'],prereqs:['whole-vs-part','subset-concept']},
  'fraction-concept':{id:'fraction-concept',type:'computational',level:4,
    q:'What does 12/4 equal?',correct:'3',wrong:['8','48'],prereqs:['divide-numbers']},
  'exponent-concept':{id:'exponent-concept',type:'conceptual',level:3,
    q:'What does x\u00b2 mean?',correct:'x multiplied by itself',
    wrong:['x multiplied by 2','x divided by 2'],prereqs:['self-multiply','square-number']},
  'slope-concept':{id:'slope-concept',type:'conceptual',level:2,
    q:'What does the slope of a line measure?',correct:'Change in y per unit change in x',
    wrong:['The y-intercept','The correlation'],prereqs:['rate-of-change','coordinate-pairs']},
  'residual-concept':{id:'residual-concept',type:'conceptual',level:2,
    q:'What is a residual?',correct:'Observed y minus predicted y',
    wrong:['Predicted y minus mean y','The slope of the line'],prereqs:['subtraction-for-deviation','coordinate-pairs']},
  'bins-conditions':{id:'bins-conditions',type:'conceptual',level:2,
    q:'What are the BINS conditions for a binomial?',correct:'Binary outcomes, Independent trials, fixed N, Same probability',
    wrong:['Large sample, Normal, Random','Paired, Equal variance, Normal'],prereqs:['independence-concept','basic-probability','double-counting']},
  'normal-approx':{id:'normal-approx',type:'conceptual',level:3,
    q:'When can we use a Normal model for a sampling distribution?',correct:'When np and n(1-p) are both at least 10 (large counts)',
    wrong:['Always, for any sample size','Only when the population is Normal'],prereqs:['bigger-smaller','part-of-whole']},
  'order-statistics-concept':{id:'order-statistics-concept',type:'mc',level:2,
    q:'What must you do to data before finding quartiles?',
    correct:'Sort the values from smallest to largest',
    wrong:['Square all values','Subtract the mean from each value'],
    prereqs:['compare-numbers']},
  'correlation-concept':{id:'correlation-concept',type:'mc',level:2,
    q:'What does the correlation coefficient r measure?',
    correct:'Strength and direction of a linear relationship',
    wrong:['The slope of the line','The proportion of variation explained'],
    prereqs:['slope-concept','fraction-concept']},
  'intercept-concept':{id:'intercept-concept',type:'mc',level:2,
    q:'In a regression line, what does the y-intercept represent?',
    correct:'The predicted y-value when x equals zero',
    wrong:['The rate of change per unit x','The correlation between x and y'],
    prereqs:['slope-concept','mean-concept']},
  // ═══ L3 nodes — fill gaps under empty L2 nodes ═══
  'constraint-concept':{id:'constraint-concept',type:'conceptual',level:3,
    q:'If you know 3 values sum to 15, how many values can you freely choose?',correct:'2 — the last is forced',
    wrong:['3 — all are free','1 — only the first is free'],prereqs:['list-addition','whole-vs-part']},
  'subtraction-for-deviation':{id:'subtraction-for-deviation',type:'conceptual',level:3,
    q:'What does subtracting the mean from a value tell you?',correct:'How far above or below the center that value is',
    wrong:['The value itself','The percentage of the data'],prereqs:['number-line-concept','subtract-from-whole']},
  'ratio-for-comparison':{id:'ratio-for-comparison',type:'conceptual',level:3,
    q:'Why divide a deviation by the standard deviation?',correct:'To express distance in standard units for comparison',
    wrong:['To make the number smaller','To remove the units'],prereqs:['equal-sharing','part-of-whole']},
  'parameter-concept':{id:'parameter-concept',type:'conceptual',level:3,
    q:'What is a population parameter?',correct:'A fixed number describing the entire population',
    wrong:['A number from a sample','A variable that changes'],prereqs:['whole-vs-part','sample-vs-population']},
  'basic-probability':{id:'basic-probability',type:'conceptual',level:3,
    q:'What does a probability of 0.5 mean?',correct:'The event happens about half the time in the long run',
    wrong:['The event will happen next','Exactly 50 out of 100'],prereqs:['part-of-whole','decimal-to-fraction']},
  'subset-concept':{id:'subset-concept',type:'conceptual',level:3,
    q:'If a class has 30 students and you pick 5, the 5 are a ___ of the class',correct:'Subset',
    wrong:['Replacement','Complement'],prereqs:['whole-vs-part','count-items']},
  'distribution-shape':{id:'distribution-shape',type:'conceptual',level:3,
    q:'What does it mean for a distribution to be symmetric?',correct:'The left and right sides are mirror images',
    wrong:['All values are equal','The mean equals zero'],prereqs:['left-right-balance','number-line-concept']},
  'sample-size-effect':{id:'sample-size-effect',type:'conceptual',level:3,
    q:'What happens to the spread of sample means as n increases?',correct:'The spread decreases — estimates become more precise',
    wrong:['The spread increases','The spread stays the same'],prereqs:['bigger-smaller','spread-shrinks']},
  'weighted-average':{id:'weighted-average',type:'conceptual',level:3,
    q:'If group A (n=60) has mean 70 and group B (n=40) has mean 80, the combined mean is closer to:',correct:'70, because group A is larger',
    wrong:['80, because it is higher','75, exactly halfway'],prereqs:['part-of-whole','bigger-smaller']},
  'rate-of-change':{id:'rate-of-change',type:'conceptual',level:3,
    q:'A car travels 150 miles in 3 hours. What is the rate?',correct:'50 miles per hour',
    wrong:['150 miles per hour','3 miles per hour'],prereqs:['rise-over-run','equal-sharing']},
  'coordinate-pairs':{id:'coordinate-pairs',type:'conceptual',level:3,
    q:'In the point (4, 7), what does the 7 represent?',correct:'The vertical (y) position',
    wrong:['The horizontal (x) position','The distance from the origin'],prereqs:['xy-plot','number-line-concept']},
  // ═══ L3 gap-fillers: fatten thin branches ═══
  'prob-multiply':{id:'prob-multiply',type:'conceptual',level:3,
    q:'If two independent events each have probability 0.5, P(both) = ?',correct:'0.25 — multiply the probabilities',
    wrong:['0.5 — same as each one','1.0 — they always happen'],prereqs:['self-multiply','part-of-whole']},
  'max-variability':{id:'max-variability',type:'conceptual',level:3,
    q:'At what value of p is p(1-p) largest?',correct:'p = 0.5 — maximum uncertainty',
    wrong:['p = 0 — no successes','p = 1 — all successes'],prereqs:['complement-concept','compare-numbers']},
  'variability-emphasis':{id:'variability-emphasis',type:'conceptual',level:3,
    q:'Why do statisticians care about variability, not just the average?',correct:'Two datasets can have the same mean but very different spreads',
    wrong:['Variability is always bad','The mean captures everything'],prereqs:['number-line-concept','compare-numbers']},
  'why-subtract-one':{id:'why-subtract-one',type:'conceptual',level:3,
    q:'In a sample of 5, if you know the mean, how many values can you freely pick?',correct:'4 — the 5th is forced by the mean',
    wrong:['5 — all are free','3 — two are fixed'],prereqs:['constraint-concept','subtract-from-whole']},
  'with-replacement-example':{id:'with-replacement-example',type:'conceptual',level:3,
    q:'You draw a card, put it back, and draw again. Does the first draw change the second?',correct:'No — replacing resets the deck',
    wrong:['Yes — you might draw the same card','It depends on the card'],prereqs:['random-selection','part-of-whole']},
  // ═══ L4 nodes — fill gaps under empty L3 nodes ═══
  'random-selection':{id:'random-selection',type:'conceptual',level:4,
    q:'What makes a selection "random"?',correct:'Every individual has an equal chance of being selected',
    wrong:['You pick without looking','You pick the first ones you see'],prereqs:['fraction-of-group','compare-numbers']},
  'equal-sharing':{id:'equal-sharing',type:'computational',level:4,
    q:'12 items split equally among 3 people — each gets?',correct:'4',
    wrong:['3','6'],prereqs:['divide-numbers']},
  'subtract-from-whole':{id:'subtract-from-whole',type:'computational',level:4,
    q:'If 40% are boys, what percent are girls?',correct:'60%',
    wrong:['40%','50%'],prereqs:['subtract-numbers','percent-to-decimal']},
  'self-multiply':{id:'self-multiply',type:'computational',level:4,
    q:'What is 4 \u00d7 4?',correct:'16',wrong:['8','12'],prereqs:['multiply-numbers']},
  'list-addition':{id:'list-addition',type:'computational',level:4,
    q:'3 + 5 + 7 = ?',correct:'15',wrong:['12','21'],prereqs:['add-numbers']},
  'number-line-concept':{id:'number-line-concept',type:'conceptual',level:4,
    q:'On a number line, what is halfway between 2 and 8?',correct:'5',
    wrong:['4','6'],prereqs:['add-numbers','divide-numbers']},
  'venn-overlap':{id:'venn-overlap',type:'conceptual',level:4,
    q:'Two circles overlap. Items in the overlap belong to:',correct:'Both groups',
    wrong:['Neither group','Only the larger group'],prereqs:['count-items','compare-numbers']},
  'part-of-whole':{id:'part-of-whole',type:'computational',level:4,
    q:'What fraction of 20 is 5?',correct:'1/4',wrong:['1/5','1/2'],prereqs:['divide-numbers','fraction-of-group']},
  'whole-vs-part':{id:'whole-vs-part',type:'conceptual',level:4,
    q:'A bag has 10 marbles. You draw 3. The 10 is the ___ and the 3 is the ___',correct:'Whole; part',
    wrong:['Part; whole','Sample; population'],prereqs:['count-items','compare-numbers']},
  'rise-over-run':{id:'rise-over-run',type:'computational',level:4,
    q:'A line goes up 6 units over 3 horizontal units. The slope is:',correct:'2',
    wrong:['3','6'],prereqs:['divide-numbers']},
  'xy-plot':{id:'xy-plot',type:'conceptual',level:4,
    q:'To plot point (3, 5): go right ___ and up ___',correct:'Right 3, up 5',
    wrong:['Right 5, up 3','Right 8, up 0'],prereqs:['count-items','compare-numbers']},
  'bigger-smaller':{id:'bigger-smaller',type:'computational',level:4,
    q:'Which is larger: n = 10 or n = 100?',correct:'n = 100',wrong:['n = 10','They are equal'],prereqs:['compare-numbers']},
  // ═══ L4 intermediate nodes — bridge L3 concepts to L5 arithmetic ═══
  'decimal-to-fraction':{id:'decimal-to-fraction',type:'computational',level:4,
    q:'0.5 is the same as what fraction?',correct:'1/2',wrong:['1/5','5/10 only'],prereqs:['fraction-of-group','percent-to-decimal']},
  'left-right-balance':{id:'left-right-balance',type:'conceptual',level:4,
    q:'If a seesaw has equal weight on both sides, it is:',correct:'Balanced (symmetric)',
    wrong:['Tilted right','Broken'],prereqs:['compare-numbers']},
  'spread-shrinks':{id:'spread-shrinks',type:'conceptual',level:4,
    q:'You average 4 dice rolls vs 100 dice rolls. Which average is more predictable?',correct:'100 rolls — more data, less variation',
    wrong:['4 rolls — fewer numbers to track','Both are equally predictable'],prereqs:['bigger-smaller','count-items']},
  // ═══ L5 nodes — arithmetic floor (shared across many branches) ═══
  'add-numbers':{id:'add-numbers',type:'computational',level:5,
    q:'3 + 4 = ?',correct:'7',wrong:['6','12'],prereqs:[]},
  'subtract-numbers':{id:'subtract-numbers',type:'computational',level:5,
    q:'12 - 5 = ?',correct:'7',wrong:['8','17'],prereqs:[]},
  'multiply-numbers':{id:'multiply-numbers',type:'computational',level:5,
    q:'6 \u00d7 7 = ?',correct:'42',wrong:['36','48'],prereqs:[]},
  'divide-numbers':{id:'divide-numbers',type:'computational',level:5,
    q:'20 \u00f7 4 = ?',correct:'5',wrong:['4','8'],prereqs:[]},
  'percent-to-decimal':{id:'percent-to-decimal',type:'computational',level:5,
    q:'What is 40% as a decimal?',correct:'0.4',wrong:['4.0','0.04'],prereqs:[]},
  'fraction-of-group':{id:'fraction-of-group',type:'computational',level:5,
    q:'What is 1/4 of 20?',correct:'5',wrong:['4','10'],prereqs:[]},
  'compare-numbers':{id:'compare-numbers',type:'computational',level:5,
    q:'Which is greater: 0.3 or 0.7?',correct:'0.7',wrong:['0.3','They are equal'],prereqs:[]},
  'square-number':{id:'square-number',type:'computational',level:5,
    q:'3\u00b2 = ?',correct:'9',wrong:['6','27'],prereqs:[]},
  'count-items':{id:'count-items',type:'computational',level:5,
    q:'How many items in the set {a, b, c, d}?',correct:'4',wrong:['3','5'],prereqs:[]},
};
// Wire auto-generated L1 nodes to shared L2+ nodes based on question content
function wireL1toL2(PREREQ_DAG){
  const rules=[
    [/\u03a3|sigma|sum all/i,['summation-concept']],
    [/divide|divid|denominator|why\b.*\bby\s+n\b/i,['division-concept']],
    [/n-1|n minus|degrees of free/i,['df-concept']],
    [/square root|sqrt|\u221a/i,['sqrt-compute','variance-to-sd']],
    [/squar|(\^2)|\u00b2/i,['squaring-concept','exponent-concept']],
    [/mean|average|x.bar|balance point/i,['mean-concept']],
    [/standard error|SE\b|variab.*across.*sample/i,['se-concept']],
    [/sampling|sample.*distribut/i,['sampling-variability']],
    [/independent|independence/i,['independence-concept']],
    [/given|conditional|P\(A\|/i,['conditional-restrict']],
    [/expected value|E\(X\)|weight.*prob|multiply.*P\(/i,['expected-value-concept','probability-weight']],
    [/unbiased|estimat.*true|on average equal/i,['unbiased-estimator']],
    [/p\(1-p\)|1-p|complement/i,['complement-concept','proportion-arithmetic']],
    [/Normal|CLT|central limit|approx.*Normal/i,['clt-concept','normal-approx']],
    [/z.score|standard.*unit|how many SD/i,['z-score-concept']],
    [/H.?0|H.?a|null hyp|alternative hyp|hypothes.*test/i,['hypothesis-framework']],
    [/\u221an|sqrt.*n|sample size.*reduc|larger.*sample.*variab/i,['sqrt-n-effect']],
    [/critical|z\*|t\*/i,['critical-value-concept']],
    [/goodness.?of.?fit|\bGOF\b|homogeneity|one categorical variable|claimed distribution|multiple populations|two variables.*one population|one-dimensional/i,['chi-square-design','sample-vs-population','independence-concept']],
    [/\u00b1|margin|interval|range.*plausible/i,['interval-concept']],
    [/observed|(?<!\w)O(?!\w).*count/i,['observed-vs-expected']],
    [/expected.*count|(?<!\w)E(?!\w).*count/i,['observed-vs-expected']],
    [/double.count|subtract.*P\(A.*B\)|overlap/i,['double-counting']],
    [/pool|shared estimate|combine/i,['pooling-concept']],
    [/population|\u03bc.*estimat|sample.*population/i,['sample-vs-population']],
    [/slope|change in.*per|b\s.*represent/i,['slope-concept']],
    [/residual|observed.*predicted/i,['residual-concept']],
    [/BINS|binary.*independent|binomial.*condition/i,['bins-conditions']],
    [/p\s*=.*trial|success rate|probability.*success/i,['proportion-arithmetic']],
    [/what happens to .* as p increases|approaches 1|success almost certain/i,['proportion-arithmetic','bigger-smaller']],
    [/no fixed number of trials|fixed number of trials/i,['bins-conditions']],
    [/p-hat1 and p-hat2 separately|each group estimates its own proportion/i,['sample-vs-population','unbiased-estimator']],
    [/fraction|ratio|divide.*by/i,['fraction-concept','division-concept']],
    [/subtract mu|distance from the center/i,['subtraction-for-deviation','mean-concept']],
    [/y.intercept|"a".*represent|predict.*when x|a\b.*represent.*intercept/i,['intercept-concept']],
    [/\br\b.*measure|linear.*assoc|correlation|strength.*direction/i,['correlation-concept']],
    [/P\(A.*B\)|both.*occur|intersect|mutually exclusive/i,['double-counting']],
    [/P\(xi\)|probability of outcome/i,['probability-weight']],
    [/geometric|trials until|first success/i,['bins-conditions']],
    [/\bdf\b|n\s*-\s*1|degrees/i,['df-concept']],
    [/t.distribut|Welch|t\b.*distribution/i,['df-concept']],
    [/Q1|percentile|IQR|resistant|quartile/i,['order-statistics-concept']],
    [/power|alpha|significance|Type I/i,['hypothesis-framework']],
    [/\bp.hat\b|p\u0302|sample proportion/i,['unbiased-estimator','proportion-arithmetic']],
    [/\bs\b.*measure|prediction error|typical.*error/i,['variance-to-sd','residual-concept']],
    [/not.*change.*SD|shift.*equally|spread.*unchanged/i,['variance-to-sd']],
    [/multiply by 2\.54|multiplies the SD|does what to SD/i,['variance-to-sd']],
    [/absolute value|non.negative|always positive/i,['squaring-concept']],
    [/\bSE.*unit|statistic.*from.*parameter/i,['se-concept','z-score-concept']],
    [/variance|s\u00b2|square.*of.*SD|SD.*square/i,['squaring-concept','variance-to-sd']],
    [/bias|systematic|represent.*population/i,['sample-vs-population','unbiased-estimator']],
    [/random.*sample|randomiz|without.*bias/i,['sampling-variability','independence-concept']],
    [/p.value|reject.*H|fail.*reject|statistic.*significant/i,['hypothesis-framework']],
    [/10%|population size|sampling.*replacement/i,['independence-concept','sample-vs-population']],
    [/large counts|np.*10|n.*30|condition.*check/i,['clt-concept','proportion-arithmetic']],
    [/chi.square|cell.*contribut|standardized.*resid/i,['observed-vs-expected','squaring-concept']],
    [/why subtract 1|last is determined|row totals are fixed/i,['df-concept','constraint-concept']],
    [/within the fences|fences/i,['order-statistics-concept']],
    [/confidence.*level|1\.96|95%|99%/i,['critical-value-concept','interval-concept']],
    [/plausible.*value|range.*true|estimate.*parameter/i,['interval-concept','parameter-concept']],
    [/cause|causation|experiment/i,['independence-concept']],
    [/if.*r.*=|what is b\b/i,['slope-concept']],
    [/n.*different|unequal.*size|n_?[12].*differ/i,['sample-vs-population']],
    [/1\.5|multiplier|convention|cutoff.*outlier/i,['mean-concept']],
    [/log.*transform|curved|exponential.*pattern|linearize/i,['residual-concept']],
    [/back.transform|10 raised to|log\(y\)/i,['back-transform-concept']],
  ];
  for(const node of Object.values(PREREQ_DAG)){
    if(node.level!==1||!node.autoGen||node.prereqs.length>0)continue;
    const matched=new Set();
    for(const[re,ids] of rules){
      if(re.test(node.q)||re.test(node.correct)){
        ids.forEach(id=>{if(PREREQ_DAG[id])matched.add(id)});
      }
    }
    if(matched.size>0)node.prereqs=[...matched];
  }
}

AP_STATS_CARTRIDGE.variableBank=VARIABLE_BANK;
AP_STATS_CARTRIDGE.applicationBank=APPLICATION_BANK;
AP_STATS_CARTRIDGE.relationshipBank=RELATIONSHIP_BANK;
AP_STATS_CARTRIDGE.explanationGlossary=EXPLANATION_GLOSSARY;
AP_STATS_CARTRIDGE.autoBlankSpecs=AUTO_BLANK_SPECS;
AP_STATS_CARTRIDGE.domLabels=DOM_LABELS;
AP_STATS_CARTRIDGE.sharedPrereqNodes=SHARED_PREREQ_NODES;
AP_STATS_CARTRIDGE.normalizeExplanationLookup=normalizeExplanationLookup;
AP_STATS_CARTRIDGE.buildExplanationBank=buildExplanationBank;
AP_STATS_CARTRIDGE.wireL1toL2=wireL1toL2;

window.AP_STATS_CARTRIDGE=AP_STATS_CARTRIDGE;
window.TD_CARTRIDGES=window.TD_CARTRIDGES||[];
window.TD_CARTRIDGES.push(AP_STATS_CARTRIDGE);
})();
