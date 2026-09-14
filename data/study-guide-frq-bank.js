(function(window){
  window.STUDY_GUIDE_FRQ_BANK =   {
    "U1-PC-FRQ-Q02": {
      "id": "U1-PC-FRQ-Q02",
      "type": "free-response",
      "prompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA certain type of bird lives in two regions of a state. The distribution of weight for birds of this type in the northern region is approximately normal with mean 10 ounces and standard deviation 3 ounces. The distribution of weight for birds of this type in the southern region is approximately normal with mean 16 ounces and standard deviation 2.5 ounces.\n\n(a) Calculate the z-scores for a weight of 13 ounces for a bird living in the northern region and for a weight of 13 ounces for a bird living in the southern region.\n(b) Is it more likely that a bird of this type with a weight greater than 13 ounces lives in the northern region or the southern region? Justify your answer.",
      "solution": {
        "parts": [
          {
            "partId": "a",
            "description": "Calculate the z-scores for a weight of 13 ounces for a bird living in the northern region and for a weight of 13 ounces for a bird living in the southern region.",
            "response": "For the northern region: z_n = (x - μ)/σ = (13 - 10)/3 = 1\n\nFor the southern region: z_s = (x - μ)/σ = (13 - 16)/2.5 = -1.2",
            "calculations": [
              "Northern region: z_n = (13 - 10)/3 = 3/3 = 1",
              "Southern region: z_s = (13 - 16)/2.5 = -3/2.5 = -1.2"
            ]
          },
          {
            "partId": "b",
            "description": "Is it more likely that a bird of this type with a weight greater than 13 ounces lives in the northern region or the southern region? Justify your answer.",
            "response": "A bird with a weight of 13 ounces is 1 standard deviation above the mean if the bird is from the northern region. Approximately 16% of the birds from the northern region have a weight greater than 13 ounces. A bird with a weight of 13 ounces is 1.2 standard deviations below the mean if the bird is from the southern region. Approximately 88% of the birds from the southern region have a weight greater than 13 ounces. Therefore, it is more likely that a bird of this type with a weight greater than 13 ounces lives in the southern region."
          }
        ],
        "scoring": {
          "totalPoints": 4,
          "rubric": [
            {
              "part": "a",
              "maxPoints": 2,
              "criteria": [
                "The correct z-scores are listed with supporting calculations and appropriate labeling"
              ],
              "scoringNotes": "Essentially correct (E) if the correct z-scores are listed with supporting calculations and appropriate labeling. Partially correct (P) if the correct z-scores are listed but without supporting calculations or appropriate labeling. Incorrect (I) if the response does not satisfy the criteria for E or P. Note: Including the general formula for z-score is not necessary to earn an E."
            },
            {
              "part": "b",
              "maxPoints": 2,
              "criteria": [
                "Response concludes that it is more likely that a bird of this type with a weight greater than 13 ounces lives in the southern region",
                "Directly compares the two z-scores calculated in part (a) or the proportions based on the standard normal curve"
              ],
              "scoringNotes": "Essentially correct (E) if the response concludes that it is more likely that a bird of this type with a weight greater than 13 ounces lives in the southern region AND directly compares the two z-scores calculated in part (a) or the proportions based on the standard normal curve. Partially correct (P) if the response correctly calculates the proportions based on the standard normal curve but fails to make a comparison. Incorrect (I) if the response does not satisfy the criteria for E or P."
            }
          ]
        },
        "reasoning": "This question tests students' ability to calculate z-scores and use them to compare probabilities across different normal distributions. The key insight is that a weight of 13 ounces is above the mean in the northern region (z = 1) but below the mean in the southern region (z = -1.2), making it much more likely that a bird weighing more than 13 ounces comes from the southern region where 88% exceed this weight compared to only 16% in the northern region."
      }
    },
    "U2-PC-FRQ-Q02": {
      "id": "U2-PC-FRQ-Q02",
      "type": "free-response",
      "prompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA random sample of 65 high school seniors was selected from all high school seniors at a certain high school. The following scatterplot shows the height, in centimeters (cm), and the foot length, in cm, for each high school senior from the sample. The least-squares regression line is shown. The computer output from the least-squares regression analysis is also shown.\n\n(a) Calculate and interpret the residual for the high school senior with a foot length of 20 cm and a height of 160 cm.\n(b) The standard deviation of the residuals is \\(s = 5.9\\). Interpret the value in context.\n(c) Assume that the distribution of residuals is approximately normal with mean 0 cm and standard deviation 5.9 cm. What percent of the residuals are greater than 8 cm? Justify your answer.\n(d) Based on your answer to part (c), would it be surprising to randomly select a high school senior from the high school with a foot length of 20 cm and a height greater than 165 cm? Justify your answer.",
      "solution": {
        "parts": [
          {
            "partId": "a",
            "description": "Calculate and interpret the residual for the high school senior with a foot length of 20 cm and a height of 160 cm.",
            "response": "Using the regression equation \\(\\hat{y} = 105.08 + 2.599x\\), where x is foot length:\nPredicted height = \\(105.08 + 2.599(20) = 105.08 + 51.98 = 157.06\\) cm\nResidual = Actual - Predicted = \\(160 - 157.06 = 2.94\\) cm\n\nInterpretation: The high school senior with a foot length of 20 cm and height of 160 cm has an actual height that is 2.94 cm greater than what the regression model predicts based on foot length.",
            "calculations": [
              "Regression equation: \\(\\hat{y} = 105.08 + 2.599x\\)",
              "Predicted height: \\(\\hat{y} = 105.08 + 2.599(20) = 157.06\\) cm",
              "Residual = \\(160 - 157.06 = 2.94\\) cm"
            ]
          },
          {
            "partId": "b",
            "description": "The standard deviation of the residuals is s = 5.9. Interpret the value in context.",
            "response": "The standard deviation of the residuals is 5.9 cm. This means that the typical difference between the actual heights and the predicted heights from the regression line is approximately 5.9 cm. In other words, the regression predictions are typically off by about 5.9 cm when predicting height from foot length."
          },
          {
            "partId": "c",
            "description": "Assume that the distribution of residuals is approximately normal with mean 0 cm and standard deviation 5.9 cm. What percent of the residuals are greater than 8 cm? Justify your answer.",
            "response": "Given: Residuals ~ Normal(0, 5.9)\nTo find P(residual > 8):\nStandardize: \\(z = \\frac{8 - 0}{5.9} = \\frac{8}{5.9} ≈ 1.36\\)\n\nUsing the standard normal distribution:\n\\(P(Z > 1.36) = 1 - P(Z ≤ 1.36) = 1 - 0.9131 = 0.0869\\)\n\nTherefore, approximately 8.69% or about 8.7% of residuals are greater than 8 cm.",
            "calculations": [
              "\\(z = \\frac{8 - 0}{5.9} = 1.356\\)",
              "\\(P(Z > 1.36) = 1 - 0.9131 = 0.0869\\)",
              "Percentage: 8.69% ≈ 8.7%"
            ],
            "attachments": {
              "chartType": "normal",
              "mean": 0,
              "sd": 5.9,
              "shade": {
                "lower": 8,
                "upper": null
              },
              "chartConfig": {
                "xAxis": {
                  "min": -17.7,
                  "max": 17.7,
                  "tickInterval": 5.9,
                  "title": "Residual (cm)"
                },
                "yAxis": {
                  "title": "Density"
                },
                "gridLines": {
                  "horizontal": false,
                  "vertical": false
                },
                "description": "Normal distribution curve with right-tail shaded to represent P(residual > 8 cm)"
              }
            }
          },
          {
            "partId": "d",
            "description": "Based on your answer to part (c), would it be surprising to randomly select a high school senior from the high school with a foot length of 20 cm and a height greater than 165 cm? Justify your answer.",
            "response": "For a student with foot length 20 cm:\nPredicted height = 157.06 cm (from part a)\nFor height > 165 cm, the residual would be > \\(165 - 157.06 = 7.94\\) cm\n\nFrom part (c), we found that about 8.7% of residuals are greater than 8 cm. Since 7.94 cm is very close to 8 cm, the probability of a residual greater than 7.94 cm would be slightly higher than 8.7%, probably around 9-10%.\n\nSince this probability is less than 10%, it would be somewhat surprising but not extremely unusual to randomly select a high school senior with foot length 20 cm and height greater than 165 cm. Events with probabilities around 8-10% are uncommon but do occur.",
            "calculations": [
              "Required residual: \\(165 - 157.06 = 7.94\\) cm",
              "P(residual > 7.94) ≈ P(residual > 8) ≈ 8.7%",
              "Since 8.7% < 10%, this would be somewhat surprising"
            ]
          }
        ]
      },
      "scoring": {
        "totalPoints": 4,
        "rubric": [
          {
            "part": "a",
            "maxPoints": 1,
            "criteria": [
              "Correctly calculates predicted value using regression equation",
              "Correctly calculates residual as actual - predicted",
              "Provides appropriate interpretation in context"
            ],
            "scoringNotes": "Essentially correct (E) if calculation and interpretation are both correct. Partially correct (P) if calculation is correct but interpretation is weak or missing."
          },
          {
            "part": "b",
            "maxPoints": 1,
            "criteria": [
              "Correctly interprets standard deviation of residuals as typical prediction error",
              "Interpretation is given in context of the problem"
            ]
          },
          {
            "part": "c",
            "maxPoints": 1,
            "criteria": [
              "Correctly standardizes using z-score formula",
              "Uses normal distribution to find probability",
              "Provides justification for calculation"
            ],
            "scoringNotes": "Must show work for standardization and probability calculation."
          },
          {
            "part": "d",
            "maxPoints": 1,
            "criteria": [
              "Connects to answer from part (c)",
              "Correctly calculates required residual",
              "Makes appropriate conclusion about whether result would be surprising",
              "Provides clear justification"
            ]
          }
        ]
      },
      "reasoning": "This question tests understanding of residuals, their interpretation, and the use of normal distribution properties. Students must demonstrate ability to calculate residuals, interpret standard deviation of residuals, apply normal distribution calculations, and make statistical conclusions about unusual events.",
      "attachments": {
        "chartType": "scatter",
        "points": [
          {
            "x": 20,
            "y": 150
          },
          {
            "x": 20,
            "y": 160
          },
          {
            "x": 21,
            "y": 153
          },
          {
            "x": 21,
            "y": 167
          },
          {
            "x": 21.5,
            "y": 172
          },
          {
            "x": 22,
            "y": 155
          },
          {
            "x": 22,
            "y": 162
          },
          {
            "x": 22.5,
            "y": 168
          },
          {
            "x": 23,
            "y": 153
          },
          {
            "x": 23,
            "y": 158
          },
          {
            "x": 23,
            "y": 168
          },
          {
            "x": 23,
            "y": 170
          },
          {
            "x": 24,
            "y": 153
          },
          {
            "x": 24,
            "y": 160
          },
          {
            "x": 24,
            "y": 163
          },
          {
            "x": 24,
            "y": 168
          },
          {
            "x": 24,
            "y": 170
          },
          {
            "x": 24,
            "y": 175
          },
          {
            "x": 24.5,
            "y": 165
          },
          {
            "x": 24.5,
            "y": 169
          },
          {
            "x": 25,
            "y": 162
          },
          {
            "x": 25,
            "y": 167
          },
          {
            "x": 25,
            "y": 171
          },
          {
            "x": 25,
            "y": 172
          },
          {
            "x": 25.5,
            "y": 165
          },
          {
            "x": 25.5,
            "y": 178
          },
          {
            "x": 26,
            "y": 160
          },
          {
            "x": 26,
            "y": 167
          },
          {
            "x": 26,
            "y": 169
          },
          {
            "x": 26,
            "y": 170
          },
          {
            "x": 26,
            "y": 172
          },
          {
            "x": 26,
            "y": 176
          },
          {
            "x": 26,
            "y": 180
          },
          {
            "x": 26,
            "y": 189
          },
          {
            "x": 26.5,
            "y": 177
          },
          {
            "x": 26.5,
            "y": 184
          },
          {
            "x": 27,
            "y": 168
          },
          {
            "x": 27,
            "y": 175
          },
          {
            "x": 27,
            "y": 178
          },
          {
            "x": 27,
            "y": 183
          },
          {
            "x": 27,
            "y": 185
          },
          {
            "x": 27.5,
            "y": 172
          },
          {
            "x": 28,
            "y": 170
          },
          {
            "x": 28,
            "y": 177
          },
          {
            "x": 28,
            "y": 182
          },
          {
            "x": 28,
            "y": 185
          },
          {
            "x": 28,
            "y": 187
          },
          {
            "x": 29,
            "y": 178
          },
          {
            "x": 29,
            "y": 184
          },
          {
            "x": 30,
            "y": 179
          },
          {
            "x": 30,
            "y": 185
          },
          {
            "x": 30.5,
            "y": 180
          },
          {
            "x": 32,
            "y": 179
          },
          {
            "x": 32.5,
            "y": 182
          },
          {
            "x": 33,
            "y": 188
          }
        ],
        "chartConfig": {
          "xAxis": {
            "min": 18,
            "max": 34,
            "tickInterval": 2,
            "title": "Foot Length (cm)"
          },
          "yAxis": {
            "min": 150,
            "max": 195,
            "tickInterval": 10,
            "title": "Height (cm)"
          },
          "gridLines": {
            "horizontal": true,
            "vertical": true
          },
          "regressionLine": true,
          "description": "Scatterplot showing relationship between foot length and height for 65 high school seniors with least-squares regression line"
        },
        "table": [
          [
            "Term",
            "Coef",
            "(SE) Coef",
            "T-Value",
            "P-Value"
          ],
          [
            "Constant",
            "105.08",
            "6.00",
            "17.51",
            "0.000"
          ],
          [
            "Foot length",
            "2.599",
            "0.238",
            "10.92",
            "0.000"
          ],
          [
            "",
            "",
            "",
            "",
            ""
          ],
          [
            "S = 5.90181",
            "",
            "R-sq = 65.42%",
            "",
            ""
          ]
        ]
      }
    },
    "U3-PC-FRQ-Q01": {
      "id": "U3-PC-FRQ-Q01",
      "type": "free-response",
      "prompt": "Researchers are investigating whether people who exercise with a training partner have a greater increase, on average, in targeted exercise intensity compared with people who exercise alone. Two methods of collecting data have been proposed.\n\nMethod I: Recruit volunteers who are willing to participate. Randomly assign each participant to exercise with a training partner or to exercise alone.\n\nMethod II: Select a random sample of people from all the people who exercise at a community fitness center. Ask each person in the sample whether they use a training partner, and use the response to create the two groups.\n\n(a) For each method, the researchers will record the change in targeted exercise intensity for each person in the investigation. They will compare the mean change in intensity between those who exercise with a training partner and those who do not.\n\n(i) Describe the population of generalization if method I is used. Explain your answer.\n\n(ii) Describe the population of generalization if method II is used. Explain your answer.\n\n(b) Suppose the investigation produces a result that is statistically significant using both methods. What can be concluded if method I is used that cannot be concluded if method II is used? Explain your answer.",
      "solution": {
        "parts": [
          {
            "partId": "a-i",
            "description": "Describe the population of generalization if method I is used. Explain your answer.",
            "response": "For method I, the results of the study apply to the volunteers and can only be generalized to the population of all people who would volunteer to participate in an exercise intensity study, because there is not random selection from a population of interest."
          },
          {
            "partId": "a-ii",
            "description": "Describe the population of generalization if method II is used. Explain your answer.",
            "response": "For method II, the results of the study can be generalized to all people who exercise at the community fitness center, because the sample was selected at random from all the people who exercise at a community fitness center."
          },
          {
            "partId": "b",
            "description": "Suppose the investigation produces a result that is statistically significant using both methods. What can be concluded if method I is used that cannot be concluded if method II is used? Explain your answer.",
            "response": "With method I, the researchers will be able to conclude that exercising with a training partner causes a greater increase in the change in targeted exercise intensity, on average, than exercising alone does. This cause-and-effect conclusion can be made with method I because each volunteer was randomly assigned to one of two treatments. With method II, the participants are not randomly assigned to the treatments. Therefore, a cause-and-effect conclusion is not appropriate."
          }
        ],
        "scoring": {
          "totalPoints": 4,
          "rubric": [
            {
              "part": "a",
              "maxPoints": 2,
              "criteria": [
                "The correct population for method I",
                "The correct justification for method I",
                "The correct population for method II",
                "The correct justification for method II"
              ],
              "scoringNotes": "Essentially correct (E) if the response contains all four components. Partially correct (P) if the response contains only two or three of the four components. Incorrect (I) if the response does not satisfy the criteria for E or P."
            },
            {
              "part": "b",
              "maxPoints": 2,
              "criteria": [
                "The cause-and-effect conclusion is correctly described in the context of the problem, with justification based on random assignment of treatments"
              ],
              "scoringNotes": "Essentially correct (E) if the cause-and-effect conclusion is correctly described in the context of the problem, with justification based on random assignment of treatments. Partially correct (P) if the response indicates that a cause-and-effect conclusion is possible because randomization of treatments was used, but the response does not put the solution in the context of this problem, OR if the response indicates that a cause-and-effect conclusion is possible but does not mention random assignment as the justification. Incorrect (I) if the response does not satisfy the criteria for E or P."
            }
          ]
        }
      },
      "reasoning": "This question tests students' understanding of experimental design concepts, specifically the difference between experiments and observational studies. Method I is an experiment because it uses random assignment of treatments, allowing for cause-and-effect conclusions. Method II is an observational study because participants self-select their groups, only allowing for association conclusions. The population of generalization depends on how the sample was selected - Method I can only generalize to volunteers willing to participate, while Method II can generalize to all people at the fitness center due to random sampling."
    },
    "U4-PC-FRQ-Q02": {
      "id": "U4-PC-FRQ-Q02",
      "type": "free-response",
      "prompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nMiguel is a golfer, and he plays on the same course each week. The following table shows the probability distribution for his score on one particular hole, known as the Water Hole.\n\nLet the random variable \\(X\\) represent Miguel's score on the Water Hole. In golf, lower scores are better.\n\n(a) Suppose one of Miguel's scores from the Water Hole is selected at random. What is the probability that Miguel's score on the Water Hole is at most 5? Show your work.\n\n(b) Calculate and interpret the expected value of \\(X\\). Show your work.\n\nThe name of the Water Hole comes from the small lake that lies between the tee, where the ball is first hit, and the hole. Miguel has two approaches to hitting the ball from the tee, the short hit and the long hit. The short hit results in the ball landing before the lake. The values of \\(X\\) in the table are based on the short hit. The long hit, if successful, results in the ball traveling over the lake and landing on the other side.\n\nA potential issue with the long hit is that the ball might land in the water, which is not a good outcome. Miguel thinks that if the long hit is successful, his expected value improves to 4.2. However, if the long hit fails and the ball lands in the water, his expected value would be worse and increases to 5.4.\n\n(c) Suppose the probability of a successful long hit is 0.4. Which approach, the short hit or the long hit, is better in terms of improving the expected value of the score? Justify your answer.\n\n(d) Let \\(p\\) represent the probability of a successful long hit. What values of \\(p\\) will make the long hit better than the short hit in terms of improving the expected value of the score? Explain your reasoning.",
      "solution": {
        "parts": [
          {
            "partId": "a",
            "description": "Calculate the probability that Miguel's score on the Water Hole is at most 5.",
            "response": "\\(P(X ≤ 5) = 0.15 + 0.40 + 0.25 = 0.80\\)",
            "calculations": [
              "P(X ≤ 5) = P(X = 3) + P(X = 4) + P(X = 5)",
              "P(X ≤ 5) = 0.15 + 0.40 + 0.25 = 0.80"
            ]
          },
          {
            "partId": "b",
            "description": "Calculate and interpret the expected value of X.",
            "response": "The expected value of \\(X\\) is the mean of \\(X\\). The expected value of \\(X\\) equals, 3 times 0.15, plus, 4 times 0.40, plus, 5 times 0.25, plus, 6 times 0.15, plus, 7 times 0.05, which equals 4.55. \\(E(X) = 3(0.15) + 4(0.40) + 5(0.25) + 6(0.15) + 7(0.05) = 4.55\\). If Miguel plays the hole many times, his average score will be about 4.55.",
            "calculations": [
              "E(X) = Σ(x × P(x))",
              "E(X) = 3(0.15) + 4(0.40) + 5(0.25) + 6(0.15) + 7(0.05)",
              "E(X) = 0.45 + 1.60 + 1.25 + 0.90 + 0.35 = 4.55"
            ]
          },
          {
            "partId": "c",
            "description": "Determine which approach is better when the probability of a successful long hit is 0.4.",
            "response": "The new expected values each have a probability, as shown in the table. The overall expected value for the long hit is \\(4.2(0.40) + 5.4(0.60) = 4.92\\), which is greater than 4.55. Because lower scores are better in golf, Miguel should use the short hit.",
            "calculations": [
              "Expected value for long hit = 4.2(0.4) + 5.4(0.6)",
              "Expected value for long hit = 1.68 + 3.24 = 4.92",
              "Since 4.92 > 4.55, the short hit is better"
            ],
            "attachments": {
              "table": [
                [
                  "E(X)",
                  "4.2",
                  "5.4"
                ],
                [
                  "Probability",
                  "0.40",
                  "0.60"
                ]
              ]
            }
          },
          {
            "partId": "d",
            "description": "Determine what values of p will make the long hit better than the short hit.",
            "response": "The overall expected value for the long hit is \\(4.2p + 5.4(1 - p)\\). For the long hit to be a better approach, the expected value must be less than 4.55, or \\(4.2p + 5.4(1 - p) < 4.55\\). Solving the inequality for \\(p\\) gives \\(p > 0.708\\). For the long hit to be a better approach, Miguel needs a probability greater than 0.708 for a successful long hit.",
            "calculations": [
              "Expected value for long hit = 4.2p + 5.4(1 - p)",
              "4.2p + 5.4(1 - p) < 4.55",
              "4.2p + 5.4 - 5.4p < 4.55",
              "-1.2p + 5.4 < 4.55",
              "-1.2p < -0.85",
              "p > 0.708"
            ],
            "attachments": {
              "table": [
                [
                  "E(X)",
                  "4.2",
                  "5.4"
                ],
                [
                  "Probability",
                  "p",
                  "1-p"
                ]
              ]
            }
          }
        ],
        "scoring": {
          "totalPoints": 4,
          "rubric": [
            {
              "part": "a",
              "maxPoints": 1,
              "criteria": [
                "Gives the correct answer of 0.80 and shows work"
              ],
              "scoringNotes": "Essentially correct (E) if the response gives the correct answer of 0.80 and shows work. Partially correct (P) if the response gives the correct answer but does not show work; OR if the response calculates P(X < 5) = 0.55 or P(X ≥ 5) = 0.45 or P(X > 5) = 0.20 with work shown. Incorrect (I) if the response does not meet the criteria for E or P."
            },
            {
              "part": "b",
              "maxPoints": 1,
              "criteria": [
                "Correctly calculates the expected value of 4.55",
                "Shows correct work for the calculation",
                "Includes the idea of many trials and context in the interpretation",
                "Includes the concept of mean (or average) in the interpretation"
              ],
              "scoringNotes": "Essentially correct (E) if the response satisfies all four components. Partially correct (P) if the response satisfies only two or three of the four components. Incorrect (I) if the response does not meet the criteria for E or P. Note: If the calculation of the expected value is incorrect, components 3 and 4 can still be satisfied using the value calculated in part (b)."
            },
            {
              "part": "c",
              "maxPoints": 1,
              "criteria": [
                "Correctly calculates the expected value for the long hit as 4.92",
                "Shows work for the calculation",
                "Concludes that the long hit is not the better approach because 4.92 > 4.55"
              ],
              "scoringNotes": "Essentially correct (E) if the response includes all three components. Partially correct (P) if the response satisfies only two of the three components. Incorrect (I) if the response does not meet the criteria for E or P. Note: If the calculation of the expected value was incorrect in part (b) or part (c) or both, component 3 can still be satisfied if a correct decision is made based on a comparison of the expected values in parts (b) and (c)."
            },
            {
              "part": "d",
              "maxPoints": 1,
              "criteria": [
                "Correctly sets up an expression for the expected value in terms of p",
                "States that the expected value from component 1 should be less than 4.55",
                "Correctly calculates the value of p",
                "States the answer as an inequality"
              ],
              "scoringNotes": "Essentially correct (E) if the response satisfies all four components. Partially correct (P) if the response satisfies only two or three of the four components. Incorrect (I) if the response does not meet the criteria for E or P. Note: If the calculation of the expected value was incorrect in part (b), components 2 and 3 can still be satisfied if the values are consistent with the expected value found in part (b)."
            }
          ]
        }
      },
      "reasoning": "This problem tests understanding of probability calculations, expected value computation and interpretation, and decision-making using expected values. It involves discrete probability distributions, weighted averages, and solving inequalities in a statistical context. The golf scenario provides a real-world application where students must compare strategies using expected value analysis.",
      "attachments": {
        "image": "assets/pngs/unit4/u4_pc_frq_q2_b.png",
        "imageAlt": "Golf course diagram showing two approaches from tee to hole: a short hit that lands before a lake, and a long hit that travels over the lake",
        "table": [
          [
            "Score",
            "3",
            "4",
            "5",
            "6",
            "7"
          ],
          [
            "Probability",
            "0.15",
            "0.40",
            "0.25",
            "0.15",
            "0.05"
          ]
        ]
      }
    },
    "U5-PC-FRQ-Q02": {
      "id": "U5-PC-FRQ-Q02",
      "type": "free-response",
      "prompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe following histogram shows the distribution of house values in a certain city. The mean of the distribution is $403,000 and the standard deviation is $278,000.\n\n(a) Suppose one house from the city will be selected at random. Use the histogram to estimate the probability that the selected house is valued at less than $500,000. Show your work.\n\n(b) Suppose a random sample of 40 houses are selected from the city. Estimate the probability that the mean value of the 40 houses is less than $500,000. Show your work.\n\nTo estimate a population mean μ, the sample mean \\(\\bar{x}\\) is often used as an estimator. However, a different estimator is called the sample midrange, given by the formula \\(\\frac{\\text{sample minimum} + \\text{sample maximum}}{2}\\).\n\n(c) The following table shows the values, in thousands of dollars, of 40 randomly selected houses in the city.\n\n(i) Calculate the sample midrange for the data.\n\n(ii) Explain why the sample midrange might be preferred to the sample mean as an estimator of the population mean.\n\n(d) To investigate the sampling distribution of the sample midrange, a simulation is performed in which 100 random samples of size n = 40 were selected from the population of house values. For each sample, the sample midrange was calculated and recorded on the following dotplot. The mean of the distribution of sample midranges is $617,000 with standard deviation $136,000.\n\nBased on the results of the simulation, explain why the sample mean might be preferred to the sample midrange as an estimator of the population mean.",
      "solution": {
        "parts": [
          {
            "partId": "a",
            "description": "Estimate probability from histogram",
            "response": "From the histogram, P(value < 500,000) ≈ 0.34 + 0.37 = 0.71.",
            "calculations": [
              "Sum the relative frequencies for the first two bars: 0.34 + 0.37 = 0.71"
            ]
          },
          {
            "partId": "b",
            "description": "Use Central Limit Theorem for sample mean",
            "response": "Because the sample size n = 40 is greater than or equal to 30, the sampling distribution of \\(\\bar{x}\\) is approximately normal with mean μ = μ = 403,000 and standard deviation \\(\\sigma_{\\bar{x}} = \\frac{\\sigma}{\\sqrt{n}} = \\frac{278,000}{\\sqrt{40}} \\approx 43,956\\).\n\n\\(P(\\bar{x} < 500,000) = P\\left(z < \\frac{500,000-403,000}{43,956}\\right) = P(z < 2.21) \\approx 0.986\\)",
            "calculations": [
              "Mean of sampling distribution = 403,000",
              "Standard deviation = 278,000/√40 ≈ 43,956",
              "z-score = (500,000 - 403,000)/43,956 ≈ 2.21",
              "P(z < 2.21) ≈ 0.986"
            ]
          },
          {
            "partId": "c-i",
            "description": "Calculate sample midrange",
            "response": "The sample midrange is \\(\\frac{34,000 + 1,084,000}{2} = \\frac{1,118,000}{2} = 559,000\\).",
            "calculations": [
              "Minimum value = 34,000",
              "Maximum value = 1,084,000",
              "Sample midrange = (34,000 + 1,084,000)/2 = 559,000"
            ]
          },
          {
            "partId": "c-ii",
            "description": "Explain advantage of sample midrange",
            "response": "The sample midrange is much easier to calculate than the sample mean because it uses only 2 values."
          },
          {
            "partId": "d",
            "description": "Compare sample mean to sample midrange",
            "response": "Because the mean of the sampling distribution of the sample midrange ($617,000) is much larger than the population mean ($403,000), the sample midrange is a biased estimator of the population mean. Also, the standard deviation of the sampling distribution of the sample midrange ($136,000) is much larger than the standard deviation of the sampling distribution of the sample mean ($43,956), meaning that the sample midrange is a less precise estimator.",
            "calculations": [
              "Sample midrange mean: $617,000 vs population mean: $403,000 (bias)",
              "Sample midrange SD: $136,000 vs sample mean SD: $43,956 (less precision)"
            ]
          }
        ],
        "scoring": {
          "totalPoints": 4,
          "rubric": [
            {
              "part": "a",
              "maxPoints": 1,
              "criteria": [
                "Essentially correct (E) if the response gives a probability between 0.68 and 0.74 and shows work that includes the sum of the heights of the first two bars in the histogram",
                "Partially correct (P) if the response gives a probability between 0.68 and 0.74 but does not show work OR if the response shows correct work but gives a probability that is not between 0.68 and 0.74 AND the probability given is between 0 and 1",
                "Incorrect (I) if the response does not meet the criteria for E or P, including if the response uses a normal distribution to calculate a probability"
              ]
            },
            {
              "part": "b",
              "maxPoints": 1,
              "criteria": [
                "Essentially correct (E) if the response satisfies three components: indicates use of a normal distribution with the correct mean ($403,000) and correct standard deviation ($43,956), indicates the correct boundary value and direction, includes a probability consistent with components 1 and 2",
                "Partially correct (P) if the response satisfies only two of the three components",
                "Incorrect (I) if the response does not meet the criteria for E or P"
              ],
              "scoringNotes": "Components 1 and 2 are satisfied with a well-labeled calculator command or well-labeled normal sketch. Component 1 is satisfied if work is shown for a z-score calculation, but a z-score calculation alone does not satisfy component 3 because it lacks direction."
            },
            {
              "part": "c",
              "maxPoints": 1,
              "criteria": [
                "Essentially correct (E) if the response satisfies both components: provides the correct midrange (either 559,000 or 559) AND states that the sample midrange is easier to calculate than the sample mean or gives another plausible reason",
                "Partially correct (P) if the response satisfies only one of the components",
                "Incorrect (I) if the response does not meet the criteria for E or P"
              ],
              "scoringNotes": "The answer to part (c-i) does not require units, but the correct inclusion of units should be considered a plus for holistic scoring."
            },
            {
              "part": "d",
              "maxPoints": 1,
              "criteria": [
                "Essentially correct (E) if the response states that the sample midrange is a biased estimator AND provides numerical evidence (center argument) OR the sample midrange is more variable AND provides numerical evidence (variability argument) OR the distribution of the sample midrange is not approximately normal while the sample mean is (shape argument)",
                "Partially correct (P) if the response states bias without numerical evidence OR states variability without numerical evidence OR mentions shape without explaining the disadvantage",
                "Incorrect (I) if the response does not meet the criteria for E or P"
              ],
              "scoringNotes": "If a response addresses more than one argument (center, variability, shape), this should be considered a plus for holistic scoring."
            }
          ]
        }
      },
      "reasoning": "This question tests multiple concepts including using histograms to estimate probabilities, applying the Central Limit Theorem for sample means, calculating alternative estimators like the sample midrange, and comparing estimator properties (bias and variability). Part (a) requires direct interpretation of a histogram, part (b) applies CLT with proper standardization, part (c) introduces the midrange estimator and its computational advantage, while part (d) uses simulation results to compare estimator properties, emphasizing that the sample mean is unbiased and more precise than the sample midrange.",
      "attachments": {
        "table": [
          [
            "34",
            "38",
            "95",
            "110",
            "137",
            "140",
            "155",
            "155",
            "169",
            "207"
          ],
          [
            "209",
            "217",
            "274",
            "314",
            "314",
            "323",
            "343",
            "347",
            "349",
            "363"
          ],
          [
            "369",
            "373",
            "388",
            "389",
            "397",
            "416",
            "448",
            "450",
            "483",
            "487"
          ],
          [
            "488",
            "516",
            "571",
            "595",
            "600",
            "738",
            "762",
            "769",
            "863",
            "1,084"
          ]
        ],
        "charts": [
          {
            "chartType": "histogram",
            "xLabels": [
              "0-250",
              "250-500",
              "500-750",
              "750-1000",
              "1000-1250",
              "1250-1500",
              "1500-1750",
              "1750-2000",
              "2000-2250",
              "2250-2500"
            ],
            "series": [
              {
                "name": "Relative Frequency",
                "values": [
                  0.34,
                  0.37,
                  0.18,
                  0.07,
                  0.025,
                  0.0125,
                  0.00625,
                  0.003125
                ]
              }
            ],
            "chartConfig": {
              "yAxis": {
                "min": 0,
                "max": 0.4,
                "tickInterval": 0.05,
                "title": "Relative Frequency"
              },
              "xAxis": {
                "title": "Value (thousands of dollars)",
                "labelType": "upperBound"
              },
              "gridLines": {
                "horizontal": true,
                "vertical": false
              },
              "description": "Histogram showing distribution of house values with bars at 0-500, 500-1000, 1000-1500, 1500-2000, 2000-2500 thousand dollars"
            }
          },
          {
            "chartType": "dotplot",
            "values": [
              400,
              420,
              420,
              430,
              430,
              430,
              430,
              440,
              440,
              450,
              460,
              470,
              470,
              470,
              480,
              480,
              510,
              520,
              520,
              530,
              540,
              540,
              550,
              550,
              550,
              550,
              550,
              560,
              560,
              570,
              580,
              580,
              580,
              590,
              600,
              600,
              600,
              600,
              610,
              620,
              620,
              620,
              630,
              630,
              630,
              630,
              640,
              650,
              650,
              650,
              670,
              670,
              680,
              680,
              680,
              690,
              700,
              700,
              700,
              700,
              710,
              710,
              710,
              720,
              720,
              740,
              750,
              780,
              780,
              790,
              800,
              800,
              800,
              810,
              820,
              830,
              830,
              830,
              950,
              970,
              1070
            ],
            "fullWidth": true,
            "chartConfig": {
              "xAxis": {
                "min": 400,
                "max": 1100,
                "tickInterval": 100,
                "title": "Sample Midrange (thousands of dollars)"
              },
              "gridLines": {
                "horizontal": false,
                "vertical": false
              },
              "dotRadius": 4,
              "description": "Dotplot showing distribution of sample midranges from simulation with 100 samples"
            }
          }
        ]
      }
    },
    "U6-PC-FRQ-Q01": {
      "id": "U6-PC-FRQ-Q01",
      "type": "free-response",
      "prompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA recent survey collected information on television viewing habits from a random sample of 1,000 people in the United States. Of those sampled, 37 percent indicated that their favorite sport to watch on television was American football.\n\n(a) Construct and interpret a 95 percent confidence interval for the proportion of all people in the United States who would indicate that their favorite sport to watch on television is American football.\n\n(b) Based on your answer to part (a), is it reasonable to believe that 33 percent is the actual percent of people in the United States whose favorite sport to watch on television is American football? Justify your answer.",
      "solution": {
        "parts": [
          {
            "partId": "a-step1",
            "description": "Identify the correct procedure with conditions.",
            "response": "The appropriate procedure is the one-sample z-interval for a population proportion. The sample proportion is \\(\\hat{p} = 0.37\\).\n\nConditions:\n• Data were collected from a random sample as stated.\n• Sample size is large enough: \\(n\\hat{p} = 1,000(0.37) \\geq 10\\) and \\(n(1 - \\hat{p}) = 1,000(0.63) \\geq 10\\)\n• The sampling method was probably conducted without replacement. It is reasonable to assume that the population of people in the United States was greater than 10 times the sample size of 1,000."
          },
          {
            "partId": "a-step2",
            "description": "Construct the interval.",
            "response": "For 95% confidence, the correct z-value is 1.96.\n\nThe interval is \\(0.37 \\pm 1.96\\sqrt{\\frac{(0.37)(0.63)}{1,000}} = 0.37 \\pm 0.03\\), or (0.34, 0.40).",
            "calculations": [
              "Standard error: \\(\\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n}} = \\sqrt{\\frac{(0.37)(0.63)}{1,000}} = \\sqrt{\\frac{0.2331}{1,000}} \\approx 0.0153\\)",
              "Margin of error: \\(1.96 \\times 0.0153 \\approx 0.03\\)",
              "Confidence interval: \\(0.37 \\pm 0.03 = (0.34, 0.40)\\)"
            ]
          },
          {
            "partId": "a-step3",
            "description": "Interpret the interval.",
            "response": "We are 95% confident that the proportion of all people in the United States who would indicate that American football is their favorite sport to watch on television is between 0.34 and 0.40.\n\nOR\n\nWe are 95% confident that the percent of all people in the United States who would indicate that American football is their favorite sport to watch on television is between 34% and 40%."
          },
          {
            "partId": "b",
            "description": "Based on your answer to part (a), is it reasonable to believe that 33 percent is the actual percent of people in the United States whose favorite sport to watch on television is American football? Justify your answer.",
            "response": "It is not reasonable to conclude that the population percent is 33% because 0.33 is not included in the interval (0.34, 0.40)."
          }
        ],
        "scoring": {
          "totalPoints": 4,
          "rubric": [
            {
              "part": "a-step1",
              "maxPoints": 1,
              "criteria": [
                "The correct interval is identified, either by name or formula",
                "The random sampling condition is checked",
                "The sample size conditions are checked"
              ],
              "scoringNotes": "Essentially correct (E) if the response satisfies all three components. Partially correct (P) if the response satisfies only two of the three components. Incorrect (I) if the response does not meet the criteria for E or P. Note: Checking the independence condition that \\(n \\leq 10\\%N\\) is not necessary to score an E for scoring step 1, but this should be considered a plus for the purposes of holistic scoring."
            },
            {
              "part": "a-step2",
              "maxPoints": 1,
              "criteria": [
                "Calculates the correct interval with work"
              ],
              "scoringNotes": "Essentially correct (E) if the response calculates the correct interval with work. Partially correct (P) if the response calculates the correct interval with no work OR if the response gives an interval with a calculation error or with the wrong z-value. Incorrect (I) if the response does not meet the criteria for E or P."
            },
            {
              "part": "a-step3",
              "maxPoints": 1,
              "criteria": [
                "A reasonable interpretation in context and details about the population the interval represents",
                "The interpretation is clear that the interval estimates the population proportion",
                "The interpretation is given with 95% confidence"
              ],
              "scoringNotes": "Essentially correct (E) if the response satisfies all three components. Partially correct (P) if the response includes only two of the three components. Incorrect (I) if the response does not meet the criteria for E or P."
            },
            {
              "part": "b",
              "maxPoints": 1,
              "criteria": [
                "A correct conclusion that is consistent with the interval calculated in part (a)",
                "A correct justification"
              ],
              "scoringNotes": "Essentially correct (E) if the response satisfies both components. Partially correct (P) if the response satisfies only one of the two components. Incorrect (I) if the response does not meet the criteria for E or P. Note: The justification must reference the interval."
            }
          ]
        }
      },
      "reasoning": "This question tests students' ability to construct and interpret a confidence interval for a population proportion, and to use that interval to assess the plausibility of a particular claim about the parameter value. The solution demonstrates the complete inference process: identifying the appropriate procedure and checking conditions, performing the calculations correctly, interpreting the interval in context, and using the interval to make a decision about a specific claim."
    },
    "U7-PC-FRQ-Q02": {
      "id": "U7-PC-FRQ-Q02",
      "type": "free-response",
      "prompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe following stemplot shows the swimming speeds, in kilometers per hour (km/h), for a random sample of 31 emperor penguins.\n\n(a) The mean of the sample is 9.771 km/h, and the standard deviation is 0.944 km/h. Construct and interpret a 95 percent confidence interval for the mean swimming speed of all emperor penguins in the population.\n\n(b) Can the estimate of the mean swimming speed be generalized to all types of penguins? Explain your reasoning.",
      "solution": {
        "parts": [
          {
            "partId": "a-step1",
            "description": "Identify the correct procedure with conditions",
            "response": "The appropriate procedure is the one-sample \\(t\\)-interval for population mean: \\(\\bar{x} ± t^* \\frac{s}{\\sqrt{n}}\\).\n\n**Conditions:**\n• Data were collected from a random sample as stated.\n• The sample size \\(n = 31\\) is large enough to assume that the sampling distribution of the sample mean is approximately normal.\n\nOR\n\nIt can be assumed that the population is roughly normal because the distribution of the sample, as shown in the stemplot, does not have strong skew or outliers.\n• The random sampling condition is checked.",
            "calculations": [
              "Sample size: n = 31",
              "Sample mean: x̄ = 9.771 km/h",
              "Sample standard deviation: s = 0.944 km/h",
              "Confidence level: 95%"
            ]
          },
          {
            "partId": "a-step2",
            "description": "Construct the interval",
            "response": "Since df = n - 1 = 31 - 1 = 30 for 95% confidence and 30 degrees of freedom, the correct \\(t\\)-critical value is \\(t^* = 2.042\\).\n\nThe interval is \\(9.771 ± 2.042 \\frac{0.944}{\\sqrt{31}} = 9.771 ± 0.346\\), which produces the interval (9.425, 10.117).",
            "calculations": [
              "Degrees of freedom: df = 31 - 1 = 30",
              "Critical value: t* = 2.042",
              "Standard error: s/√n = 0.944/√31 ≈ 0.170",
              "Margin of error: t* × SE = 2.042 × 0.170 ≈ 0.346",
              "Confidence interval: 9.771 ± 0.346 = (9.425, 10.117)"
            ]
          },
          {
            "partId": "a-step3",
            "description": "Interpret the interval",
            "response": "We are 95% confident that the mean swimming speed of the population of emperor penguins is between 9.425 kilometers per hour and 10.117 kilometers per hour.\n\nOR\n\nWe are 95% confident that the confidence interval (9.425, 10.117) captures the population mean swimming speed of emperor penguins."
          },
          {
            "partId": "b",
            "description": "Can the estimate of the mean swimming speed be generalized to all types of penguins? Explain your reasoning.",
            "response": "It is not reasonable to generalize the estimate of the mean swimming speed to all types of penguins because the sample only consisted of emperor penguins."
          }
        ],
        "scoring": {
          "totalPoints": 4,
          "rubric": [
            {
              "part": "a-step1",
              "maxPoints": 1,
              "criteria": [
                "The correct interval is identified, either by name or formula",
                "The sample size condition is checked and indicates the sample size is greater than 30, OR it can be assumed that the population is roughly normal because the distribution of the sample does not have strong skew or outliers",
                "The random sampling condition is checked"
              ],
              "scoringNotes": "Essentially correct (E) if the response satisfies all three components. Partially correct (P) if the response satisfies only two of the three components. A response that checks the 10% condition, that it is reasonable to assume there are more than 10(31) = 310 penguins, can be used in holistic grading to decide to score up."
            },
            {
              "part": "a-step2",
              "maxPoints": 1,
              "criteria": [
                "Calculates the correct interval with work shown"
              ],
              "scoringNotes": "Essentially correct (E) if the response calculates the correct interval with work. Partially correct (P) if the response calculates the correct interval with no work OR if the response gives an interval with a calculation error or with the wrong t-value."
            },
            {
              "part": "a-step3",
              "maxPoints": 1,
              "criteria": [
                "A reasonable interpretation in context is given",
                "The interpretation is clear that the interval estimates the population mean",
                "The interpretation is given with 95% confidence"
              ],
              "scoringNotes": "Essentially correct (E) if the response satisfies all three components. Partially correct (P) if the response includes only two of the three conditions."
            },
            {
              "part": "b",
              "maxPoints": 1,
              "criteria": [
                "Identifies that the results cannot be generalized",
                "A correct justification which indicates that only emperor penguins were sampled"
              ],
              "scoringNotes": "Essentially correct (E) if the response satisfies both components. Partially correct (P) if the response satisfies the first component but provides weak justification."
            }
          ]
        }
      },
      "reasoning": "This question assesses confidence interval construction and interpretation for a population mean using the t-distribution. Key statistical concepts include: (1) identifying appropriate procedures and checking conditions (random sampling, normality/large sample size), (2) correctly calculating a one-sample t-interval using the formula x̄ ± t*(s/√n), (3) proper interpretation that captures the population parameter with stated confidence level, and (4) understanding limitations of generalizability based on sampling scope. The question emphasizes the distinction between the sample (emperor penguins) and the broader population of interest (all penguins), highlighting that statistical inferences are limited to the population from which the sample was drawn.",
      "attachments": {
        "table": [
          [
            "Speed (km/h)"
          ],
          [
            "7 | 8"
          ],
          [
            "8 | 3 4"
          ],
          [
            "8 | 6 7 9"
          ],
          [
            "9 | 0 0 1 3 4"
          ],
          [
            "9 | 5 5 6 7 8 8 9"
          ],
          [
            "10 | 0 1 1 2 3"
          ],
          [
            "10 | 5 8 8 8"
          ],
          [
            "11 | 0 2 3"
          ],
          [
            "11 | 5"
          ],
          [
            "Key: 7|8 = 7.8"
          ]
        ]
      }
    },
    "U8-PC-FRQ-Q01": {
      "id": "U8-PC-FRQ-Q01",
      "type": "free-response",
      "prompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA marketing director for a beverage company conducted a study to investigate people's soda preferences in two regions of the country. The director selected a random sample of 100 people from the east coast and a random sample of 100 people from the west coast to survey. The responses are summarized in the following table.\n\nDo the data provide convincing statistical evidence, at the level of \\(\\alpha = 0.05\\), that the preferences are different between the two regions of the country? Complete the appropriate inference procedure to support your answer.",
      "solution": {
        "parts": [
          {
            "partId": "step1",
            "description": "Appropriate test and hypotheses",
            "response": "The appropriate test is the chi-square test for homogeneity. The hypotheses are as follows:\n\n\\(H_0\\): There is no difference in soda preference between people from the east coast and people from the west coast\n\n\\(H_a\\): There is a difference in soda preference between people from the east coast and people from the west coast."
          },
          {
            "partId": "step2",
            "description": "Conditions and calculations",
            "response": "Conditions:\n\n1) Independence\n   - Two random samples were taken, one from the population of people on the east coast and one from the population of people on the west coast.\n   - The sample size of 100 is less than 10% of the population size for both the east and west coast.\n\n2) Large counts should be used.\n   - All expected counts should be greater than 5\n\nCalculations:\nThe test statistic is \\(\\chi^2 \\approx 1.137\\) with 2 degrees of freedom. The p-value is 0.5663.",
            "attachments": {
              "table": [
                [
                  "",
                  "East Coast",
                  "West Coast"
                ],
                [
                  "Regular soda",
                  "40.5",
                  "40.5"
                ],
                [
                  "Diet soda",
                  "40.5",
                  "40.5"
                ],
                [
                  "No preference",
                  "19",
                  "19"
                ]
              ]
            }
          },
          {
            "partId": "step3",
            "description": "Justification of conclusion",
            "response": "The p-value of 0.5663 is greater than the significance level of 0.05, so the null hypothesis is not rejected. There is not sufficient statistical evidence to support a claim that the soda preferences are different between people on the east and west coasts of the country."
          }
        ],
        "scoring": {
          "totalPoints": 4,
          "rubric": [
            {
              "part": "step1",
              "maxPoints": 1,
              "criteria": [
                "The correct test is identified",
                "The null and alternative hypotheses are stated correctly",
                "Context is explicitly stated or is implied through labeling of variables"
              ],
              "scoringNotes": "Essentially correct (E) if all three components satisfied. Partially correct (P) if only two components satisfied. Incorrect (I) if response does not meet criteria for E or P. Component 1 can be satisfied in scoring step 2 if the correct formula is shown."
            },
            {
              "part": "step2",
              "maxPoints": 1,
              "criteria": [
                "The three conditions are correctly checked",
                "The correct test statistic is computed",
                "A p-value consistent with the computed test statistic"
              ],
              "scoringNotes": "Essentially correct (E) if all three components satisfied. Partially correct (P) if only two components satisfied. Incorrect (I) if response does not meet criteria for E or P. A response that indicates a single stratified random sample was selected, with coast as strata, satisfies the first condition."
            },
            {
              "part": "step3",
              "maxPoints": 1,
              "criteria": [
                "Explicitly compares the p-value to the significance level",
                "Provides a correct decision about the null hypothesis that is consistent with the computed p-value",
                "Gives statement of conclusion in context"
              ],
              "scoringNotes": "Essentially correct (E) if all three components satisfied. Partially correct (P) if only two components satisfied. Incorrect (I) if response does not meet criteria for E or P."
            }
          ]
        }
      },
      "reasoning": "This is a chi-square test for homogeneity comparing soda preferences between two independent populations (East Coast vs West Coast). The test statistic is approximately 1.137 with 2 degrees of freedom, yielding a p-value of 0.5663. Since this p-value exceeds the significance level of 0.05, we fail to reject the null hypothesis and conclude there is insufficient evidence of a difference in soda preferences between the two regions.",
      "attachments": {
        "table": [
          [
            "",
            "East Coast",
            "West Coast"
          ],
          [
            "Regular soda",
            "44",
            "37"
          ],
          [
            "Diet soda",
            "39",
            "42"
          ],
          [
            "No preference",
            "17",
            "21"
          ],
          [
            "Total",
            "100",
            "100"
          ]
        ]
      }
    },
    "U9-PC-FRQ-Q01": {
      "id": "U9-PC-FRQ-Q01",
      "type": "free-response",
      "prompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nAt a plant that manufactures bars of steel, a machine is used to cut the bars to specific lengths. The machine has a dial that sets the length of the bars to be cut. However, the dial is currently out of alignment and the plant manager is collecting data to assess the situation. All measurements are in millimeters.\n\n(a) Use the following grid to construct a scatterplot in which dial setting is the explanatory variable and output length is the response variable. Based on your graph, does a linear model seem appropriate? Justify your answer.\n\n(b) Use the data to construct a least-squares regression line to predict output length from dial setting.\n\n(c) Assume that all conditions for inference are met. Indicate the hypotheses appropriate to test whether there is a linear relationship between output length and dial setting.\n\n(d) The test statistic for the appropriate test is \\(t = 9.018\\). Do the data provide convincing statistical evidence that there is a linear relationship between output length and dial setting?",
      "solution": {
        "parts": [
          {
            "partId": "a",
            "description": "Use the following grid to construct a scatterplot in which dial setting is the explanatory variable and output length is the response variable. Based on your graph, does a linear model seem appropriate? Justify your answer.",
            "response": "The relationship between Output Length and Dial Setting appears to be fairly strong and linear. There does not appear to be any substantial curvature nor do there seem to be any outliers, so a linear model seems appropriate in this situation.",
            "attachments": {
              "chartType": "scatter",
              "points": [
                {
                  "x": 75,
                  "y": 78
                },
                {
                  "x": 77,
                  "y": 79
                },
                {
                  "x": 79,
                  "y": 82
                },
                {
                  "x": 80,
                  "y": 83
                },
                {
                  "x": 81,
                  "y": 85
                },
                {
                  "x": 82,
                  "y": 83
                },
                {
                  "x": 83,
                  "y": 86
                },
                {
                  "x": 85,
                  "y": 88
                }
              ],
              "chartConfig": {
                "xAxis": {
                  "min": 74,
                  "max": 86,
                  "tickInterval": 2,
                  "title": "Dial Setting"
                },
                "yAxis": {
                  "min": 76,
                  "max": 88,
                  "tickInterval": 2,
                  "title": "Output Length (millimeters)"
                },
                "gridLines": {
                  "horizontal": true,
                  "vertical": true
                },
                "description": "Scatterplot showing strong linear relationship between dial setting and output length"
              }
            }
          },
          {
            "partId": "b",
            "description": "Use the data to construct a least-squares regression line to predict output length from dial setting.",
            "response": "The least-squares regression line, found using technology, is: Predicted Output Length = 2.204 + 1.007(Dial Setting)",
            "calculations": [
              "Using technology to calculate least-squares regression",
              "Slope estimate ≈ 1.007",
              "Intercept estimate ≈ 2.204",
              "Equation: ŷ = 2.204 + 1.007x"
            ]
          },
          {
            "partId": "c",
            "description": "Assume that all conditions for inference are met. Indicate the hypotheses appropriate to test whether there is a linear relationship between output length and dial setting.",
            "response": "The hypotheses are as follows:\n\\(H_0\\): The slope of the population regression line relating output length and dial setting is equal to 0.\n\\(H_a\\): The slope of the population regression line relating output length and dial setting is not equal to 0.\n\nAlternatively:\n\\(H_0: \\beta_1 = 0\\)\n\\(H_a: \\beta_1 \\neq 0\\)\n\nOr in context:\n\\(H_0\\): There is not a linear relationship between output length and dial setting in the population.\n\\(H_a\\): There is a linear relationship between output length and dial setting in the population."
          },
          {
            "partId": "d",
            "description": "The test statistic for the appropriate test is t = 9.018. Do the data provide convincing statistical evidence that there is a linear relationship between output length and dial setting?",
            "response": "The p-value is 0.0001 based on a t-test with \\(n - 2 = 6\\) degrees of freedom. The p-value is less than any reasonable level of significance (such as 0.05 or 0.01). Reject the null hypothesis. There is statistical evidence to support the claim that there is a linear relationship between output length and dial setting.",
            "calculations": [
              "Test statistic: t = 9.018",
              "Degrees of freedom: n - 2 = 8 - 2 = 6",
              "p-value = 0.0001",
              "Compare p-value to α = 0.05: 0.0001 < 0.05"
            ]
          }
        ],
        "scoring": {
          "totalPoints": 4,
          "rubric": [
            {
              "part": "a",
              "maxPoints": 1,
              "criteria": [
                "Correctly constructs a scatterplot with dial setting as explanatory variable and output length as response variable",
                "Indicates, with justification, that a linear model seems appropriate"
              ],
              "scoringNotes": "Essentially correct (E) if response correctly constructs scatterplot AND indicates with justification that linear model seems appropriate. Partially correct (P) if fails to accurately construct plot but indicates with justification that linear model seems appropriate, OR constructs appropriate scatterplot but fails to justify that linear model seems appropriate. Incorrect (I) if response does not satisfy criteria for E or P."
            },
            {
              "part": "b",
              "maxPoints": 1,
              "criteria": [
                "Indicates estimate for slope of least-squares regression line is approximately 1",
                "Indicates estimate for intercept of least-squares regression line is approximately 2.2",
                "Explanatory and response variables are clearly labeled in the regression line OR variables are clearly defined"
              ],
              "scoringNotes": "Essentially correct (E) if response satisfies all three components. Partially correct (P) if response satisfies two of three components OR reverses explanatory and response variables. Incorrect (I) if response does not satisfy criteria for E or P."
            },
            {
              "part": "c",
              "maxPoints": 1,
              "criteria": [
                "Provides null hypothesis that states there is not a linear relationship",
                "Provides alternative hypothesis that states there is a linear relationship"
              ],
              "scoringNotes": "Essentially correct (E) if response satisfies both components. Partially correct (P) if response satisfies one of two components. Incorrect (I) if response does not satisfy criteria for E or P."
            },
            {
              "part": "d",
              "maxPoints": 1,
              "criteria": [
                "Comparison of p-value to predetermined level of significance (0.01 or 0.05) OR comparison of test statistic to critical value",
                "Correctly rejects the null hypothesis",
                "States conclusion in context"
              ],
              "scoringNotes": "Essentially correct (E) if response satisfies all three components. Partially correct (P) if response satisfies only two of three components. Incorrect (I) if response does not meet criteria for E or P."
            }
          ]
        }
      },
      "reasoning": "This question tests students' ability to analyze linear relationships through scatterplots, calculate least-squares regression equations, formulate proper hypotheses for testing linear relationships, and interpret statistical test results. The solution demonstrates the complete process of regression analysis from visual assessment through formal hypothesis testing, emphasizing both computational skills and statistical reasoning in the context of a real manufacturing scenario.",
      "attachments": {
        "table": [
          [
            "Dial Setting",
            "Output Length"
          ],
          [
            "75",
            "78"
          ],
          [
            "77",
            "79"
          ],
          [
            "79",
            "82"
          ],
          [
            "80",
            "83"
          ],
          [
            "81",
            "85"
          ],
          [
            "82",
            "83"
          ],
          [
            "83",
            "86"
          ],
          [
            "85",
            "88"
          ]
        ],
        "chartType": "scatter",
        "points": [],
        "chartConfig": {
          "xAxis": {
            "min": 74,
            "max": 86,
            "tickInterval": 2,
            "title": "Dial Setting"
          },
          "yAxis": {
            "min": 76,
            "max": 88,
            "tickInterval": 2,
            "title": "Output Length (millimeters)"
          },
          "gridLines": {
            "horizontal": true,
            "vertical": true
          },
          "description": "Empty grid for constructing scatterplot of dial setting vs output length"
        }
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
